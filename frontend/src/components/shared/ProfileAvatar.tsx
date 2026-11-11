import React, { useState } from "react";
import { Avatar, type SxProps, type Theme } from "@mui/material";
import { AccountIcon } from "./AccountIcon";

export interface ProfileAvatarProps {
  name?: string;
  color?: string | null;
  avatarEmoji?: string | null;
  avatarUrl?: string | null;
  size?: number;
  iconFontSize?: "inherit" | "small" | "medium" | "large";
  iconSx?: SxProps<Theme>;
  sx?: SxProps<Theme>;
  variant?: "circular" | "rounded" | "square";
}

/**
 * Renders a user profile avatar photo when available, automatically falling back
 * to the configured account icon on the profile's color when unset or unreadable.
 */
export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  name,
  color,
  avatarEmoji,
  avatarUrl,
  size = 40,
  iconFontSize = "medium",
  iconSx,
  sx,
  variant = "circular",
}) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = Boolean(avatarUrl) && failedUrl !== avatarUrl;

  return (
    <Avatar
      src={showPhoto && avatarUrl ? avatarUrl : undefined}
      alt={name ? `${name} profile picture` : "Profile picture"}
      variant={variant}
      slotProps={{
        img: {
          onError: () => {
            if (avatarUrl) setFailedUrl(avatarUrl);
          },
        },
      }}
      sx={[
        {
          width: size,
          height: size,
          bgcolor: color || "primary.main",
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <AccountIcon
        icon={avatarEmoji}
        name={name}
        fontSize={iconFontSize}
        sx={[{ color: "#ffffff" }, ...(Array.isArray(iconSx) ? iconSx : iconSx ? [iconSx] : [])]}
      />
    </Avatar>
  );
};
