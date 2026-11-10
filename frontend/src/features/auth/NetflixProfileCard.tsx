import React from "react";
import {
  Box,
  Typography,
  Chip,
  ButtonBase,
  Grow,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { ProfileOut } from "../../api/client";

export interface NetflixProfileCardProps {
  profile: ProfileOut;
  index: number;
  loading: boolean;
  onClick: (profile: ProfileOut) => void;
}

export const NetflixProfileCard: React.FC<NetflixProfileCardProps> = ({
  profile,
  index,
  loading,
  onClick,
}) => {
  const profileColor = profile.color || "#486B85";

  return (
    <Grow in={!loading} timeout={300 + index * 80}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <ButtonBase
          focusRipple
          onClick={() => onClick(profile)}
          aria-label={`Select profile ${profile.name}`}
          sx={{
            width: { xs: 100, sm: 135 },
            height: { xs: 100, sm: 135 },
            borderRadius: 2, // Material Design 2 8px standard
            bgcolor: profileColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "3px solid transparent",
            position: "relative",
            overflow: "hidden",
            boxShadow: 2,
            transition: (theme) =>
              theme.transitions.create(["transform", "box-shadow", "border-color"], {
                duration: theme.transitions.duration.shorter,
                easing: theme.transitions.easing.easeInOut,
              }),
            "&:hover, &:focus-visible": {
              transform: "translateY(-4px)",
              boxShadow: 8,
              borderColor: "#ffffff",
            },
            "&:active": {
              transform: "translateY(-1px)",
              boxShadow: 4,
            },
          }}
        >
          <Typography sx={{ fontSize: { xs: "2.8rem", sm: "3.8rem" }, userSelect: "none" }}>
            {profile.avatar_emoji || profile.name.charAt(0).toUpperCase()}
          </Typography>

          {profile.has_pin && (
            <Box
              sx={{
                position: "absolute",
                bottom: 8,
                right: 8,
                bgcolor: "rgba(0,0,0,0.65)",
                borderRadius: "50%",
                p: 0.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LockOutlinedIcon sx={{ fontSize: 16, color: "#CAD2CB" }} />
            </Box>
          )}
        </ButtonBase>

        <Typography
          className="user-name"
          variant="h6"
          sx={{
            mt: 1.5,
            fontWeight: 600,
            fontSize: { xs: "1rem", sm: "1.2rem" },
            color: "rgba(255,255,255,0.8)",
            textAlign: "center",
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            transition: (theme) =>
              theme.transitions.create("color", {
                duration: theme.transitions.duration.shorter,
                easing: theme.transitions.easing.easeInOut,
              }),
          }}
        >
          {profile.name}
        </Typography>

        <Chip
          label={profile.role.replace("_", " ")}
          size="small"
          sx={{
            mt: 0.5,
            height: 22,
            fontSize: "0.7rem",
            textTransform: "capitalize",
            fontWeight: 600,
            bgcolor: "rgba(255,255,255,0.12)",
            color: "#CAD2CB",
          }}
        />
      </Box>
    </Grow>
  );
};
