import { Chain } from "@coral-xyz/chat-zeus";
import type {
  FromServer,
  Message,
  MessageWithMetadata,
  SubscriptionType,
} from "@coral-xyz/common";
import { CHAT_MESSAGES } from "@coral-xyz/common";

import { CHAT_HASURA_URL, CHAT_JWT } from "../config";
import { getChats, getChatsFromParentGuids } from "../db/chats";
import { updateLatestMessage } from "../db/friendships";
import { getUsers } from "../db/users";
import { Redis } from "../redis/Redis";
import type { User } from "../users/User";

const chain = Chain(CHAT_HASURA_URL, {
  headers: {
    Authorization: `Bearer ${CHAT_JWT}`,
  },
});

export class Room {
  private users: Map<string, User>;
  private room: string;
  private type: SubscriptionType;
  private messageHistory: MessageWithMetadata[];
  private userIdMappings: Map<string, { username: string }> = new Map<
    string,
    { username: string }
  >();
  private replyToMessageMappings: Map<
    string,
    {
      parent_message_text: string;
      parent_message_author_username: string;
      parent_message_author_uuid: string;
    }
  > = new Map<
    string,
    {
      parent_message_text: string;
      parent_message_author_username: string;
      parent_message_author_uuid: string;
    }
  >();
  public roomCreationPromise: any;
  // Only applicable for `individual` rooms. User for storing
  // The users that are part of the room.
  private roomValidation: { user1: string; user2: string } | null;

  constructor(
    room: string,
    type: SubscriptionType,
    roomValidation: { user1: string; user2: string } | null
  ) {
    this.room = room;
    this.type = type;
    this.roomValidation = roomValidation;
    this.users = new Map<string, User>();
    this.messageHistory = [];
    this.roomCreationPromise = this.init();
    console.log(`Room ${room} ${type} created`);
  }

  async init() {
    const chats = await getChats(this.room.toString(), this.type);
    this.messageHistory = await this.enrichMessages(
      chats?.sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) || []
    );
  }

  addUser(user: User) {
    this.users.set(user.id, user);
    user.send({
      type: CHAT_MESSAGES,
      payload: {
        messages: this.messageHistory,
        type: this.type,
        room: this.room,
      },
    });
  }

  async addChatMessage(
    id: string,
    userId: string,
    msg: {
      client_generated_uuid: string;
      message: string;
      message_kind: string;
      parent_client_generated_uuid?: string;
    }
  ) {
    //TODO: bulkify this
    chain("mutation")({
      insert_chats_one: [
        {
          object: {
            username: "",
            room: this.room.toString(),
            message: msg.message,
            uuid: userId,
            message_kind: msg.message_kind,
            client_generated_uuid: msg.client_generated_uuid,
            parent_client_generated_uuid: msg.parent_client_generated_uuid,
            type: this.type,
            created_at: new Date(),
          },
        },
        {
          id: true,
        },
      ],
    }).catch((e) => console.log(`Error while adding chat msg to DB ${e}`));

    if (this.type === "individual") {
      updateLatestMessage(
        parseInt(this.room),
        msg.message_kind === "gif" ? "GIF" : msg.message,
        userId,
        this.roomValidation,
        msg.client_generated_uuid
      );
    }

    const emittedMessage = (
      await this.enrichMessages([
        {
          id: 100000000,
          uuid: userId,
          message: msg.message,
          client_generated_uuid: msg.client_generated_uuid,
          message_kind: msg.message_kind,
          parent_client_generated_uuid: msg.parent_client_generated_uuid,
        },
      ])
    )[0];
    this.messageHistory.push(emittedMessage);
    this.messageHistory = this.messageHistory.slice(-50);
    this.broadcast(null, {
      type: CHAT_MESSAGES,
      payload: {
        messages: [emittedMessage],
        type: this.type,
        room: this.room,
      },
    });
    setTimeout(async () => {
      await Redis.getInstance().send(
        JSON.stringify({
          type: "message",
          payload: {
            type: this.type,
            room: this.room,
            client_generated_uuid: msg.client_generated_uuid,
          },
        })
      );
    }, 1000);
  }

  broadcast(userToSkip: string | null, msg: FromServer) {
    this.users.forEach((user) => {
      if (user.id === userToSkip) {
        return;
      }
      user.send(msg);
    });
  }

  async enrichMessages(messages: Message[]): Promise<MessageWithMetadata[]> {
    const replyIds: string[] = messages.map(
      (m) => m.parent_client_generated_uuid || ""
    );

    const uniqueReplyIds = replyIds
      .filter((x, index) => replyIds.indexOf(x) === index)
      .filter((x) => x)
      .filter((x) => !this.replyToMessageMappings.get(x || ""));

    if (uniqueReplyIds.length) {
      const parentReplies = await getChatsFromParentGuids(
        this.room.toString(),
        this.type,
        uniqueReplyIds
      );
      await this.enrichUsernames([...messages, ...parentReplies]);
      uniqueReplyIds.forEach((replyId) => {
        const reply = parentReplies.find(
          (x) => x.client_generated_uuid === replyId
        );
        if (reply) {
          this.replyToMessageMappings.set(replyId, {
            parent_message_text: reply.message,
            parent_message_author_uuid: reply.uuid || "",
            parent_message_author_username:
              this.userIdMappings.get(reply.uuid || "")?.username || "",
          });
        } else {
          console.log(`reply with id ${replyId} not found`);
        }
      });
    } else {
      await this.enrichUsernames(messages);
    }

    return messages.map((message) => {
      const username =
        this.userIdMappings.get(message.uuid || "")?.username || "";
      const image = `https://avatars.xnfts.dev/v1/${username}`;
      return {
        ...message,
        username,
        image,
        parent_message_text: message.parent_client_generated_uuid
          ? this.replyToMessageMappings.get(
              message.parent_client_generated_uuid || ""
            )?.parent_message_text
          : undefined,
        parent_message_author_username: message.parent_client_generated_uuid
          ? this.replyToMessageMappings.get(
              message.parent_client_generated_uuid || ""
            )?.parent_message_author_username
          : undefined,
        parent_message_author_uuid: message.parent_client_generated_uuid
          ? this.replyToMessageMappings.get(
              message.parent_client_generated_uuid || ""
            )?.parent_message_author_uuid
          : undefined,
      };
    });
  }

  async enrichUsernames(messages: Message[]) {
    const userIds: string[] = messages.map((m) => m.uuid || "");
    const uniqueUserIds = userIds
      .filter((x, index) => userIds.indexOf(x) === index)
      .filter((x) => !this.userIdMappings.get(x || ""));

    if (uniqueUserIds.length) {
      const metadatas = await getUsers(uniqueUserIds);
      metadatas.forEach(({ id, username }) =>
        this.userIdMappings.set(id, { username })
      );
    }
  }

  removeUser(user: User) {
    this.users.delete(user.id);
  }

  destroy() {
    console.log(`Room ${this.room} ${this.type} destroyed`);
    this.messageHistory = [];
  }

  isEmpty() {
    return this.users.size === 0;
  }
}
