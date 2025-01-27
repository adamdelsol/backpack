import type { Friendship } from "@coral-xyz/common";
import { BACKEND_API_URL } from "@coral-xyz/common";
import { toast } from "@coral-xyz/react-common";
import { friendship, useDecodedSearchParams } from "@coral-xyz/recoil";
import { styles } from "@coral-xyz/themes";
import BlockIcon from "@mui/icons-material/Block";
import InfoIcon from "@mui/icons-material/Info";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import { Drawer, ListItem, Typography } from "@mui/material";
import { useRecoilState } from "recoil";
export const useStyles = styles((theme) => ({
  container: {
    padding: 16,
    backgroundColor: `${theme.custom.colors.nav}`,
    color: theme.custom.colors.fontColor2,
  },
  icon: {
    color: theme.custom.colors.icon,
    marginRight: 10,
    height: "24px",
    width: "24px",
  },
}));

export const ChatDrawer = ({ setOpenDrawer }: { setOpenDrawer: any }) => {
  const classes = useStyles();
  const { props }: any = useDecodedSearchParams();
  const userId = props.userId;
  const remoteUsername = props.username;
  const [friendshipValue, setFriendshipValue] =
    useRecoilState<Friendship | null>(friendship({ userId }));

  const menuItems = [
    {
      title: friendshipValue?.blocked
        ? `Unblock ${remoteUsername}`
        : `Block ${remoteUsername}`,
      icon: <BlockIcon className={classes.icon} />,
      onClick: async () => {
        const updatedValue = !friendshipValue?.blocked;
        setFriendshipValue((x: any) => ({
          ...x,
          blocked: updatedValue,
          requested: updatedValue ? false : x.requested,
        }));
        await fetch(`${BACKEND_API_URL}/friends/block`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ to: userId, block: updatedValue }),
        });
        if (updatedValue) {
          toast.success(
            "Blocked",
            `@${remoteUsername} shouldn’t be showing up in your DMs from now on.`
          );
        }
        setOpenDrawer(false);
      },
    },
  ];
  if (friendshipValue?.areFriends) {
    menuItems.push({
      title: `Remove from contacts`,
      icon: <RemoveCircleIcon className={classes.icon} />,
      onClick: async () => {
        await fetch(`${BACKEND_API_URL}/friends/unfriend`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ to: userId }),
        });
        setFriendshipValue((x: any) => ({
          ...x,
          areFriends: false,
        }));
        toast.success(
          "Contact removed",
          `We've removed @${remoteUsername} from your contacts.`
        );
        setOpenDrawer(false);
      },
    });
  }
  if (friendshipValue?.areFriends || friendshipValue?.requested) {
    menuItems.push({
      title: friendshipValue?.spam ? `Remove spam` : `Mark as spam`,
      icon: <InfoIcon className={classes.icon} />,
      onClick: async () => {
        const updatedValue = !friendshipValue?.spam;
        await fetch(`${BACKEND_API_URL}/friends/spam`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ to: userId, spam: updatedValue }),
        });
        setFriendshipValue((x: any) => ({
          ...x,
          spam: updatedValue,
        }));
        setOpenDrawer(false);
      },
    });
  }

  return (
    <Drawer anchor={"bottom"} open={true} onClose={() => setOpenDrawer(false)}>
      <div className={classes.container}>
        {menuItems.map((item) => (
          <ListItem
            key={""}
            onClick={item.onClick}
            style={{
              height: "44px",
              padding: "12px",
              cursor: "pointer",
            }}
            className={classes.item}
          >
            {item.icon}
            <Typography
              style={{
                fontWeight: 500,
                fontSize: "16px",
                lineHeight: "24px",
              }}
            >
              {item.title}
            </Typography>
          </ListItem>
        ))}
      </div>
    </Drawer>
  );
};
