import type { RedisClientType } from "redis";
import { createClient } from "redis";

import { NOTIFICATIONS_QUEUE, REDIS_URL } from "./config";

export class Redis {
  private client: RedisClientType;
  private static instance: Redis;

  constructor() {
    this.client = createClient({
      url: REDIS_URL,
    });
    this.client.connect();
  }

  public static getInstance(): Redis {
    if (!this.instance) {
      this.instance = new Redis();
    }
    return this.instance;
  }

  async fetch(): Promise<string> {
    const response = await this.client.lPop(NOTIFICATIONS_QUEUE);
    return response || "";
  }
}
