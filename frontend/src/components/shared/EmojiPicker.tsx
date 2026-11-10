import React from "react";
import { Box, Typography } from "@mui/material";

export const DEFAULT_EMOJIS = [
  "👤",
  "🧑‍💻",
  "🦊",
  "🐱",
  "🏡",
  "📦",
  "⭐",
  "🔑",
  "🎨",
  "🛠️",
  "🌸",
  "⚡",
  "🍎",
  "🚀",
];

export interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  emojis?: string[];
  label?: string;
  size?: number;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  value,
  onChange,
  emojis = DEFAULT_EMOJIS,
  label,
  size = 36,
}) => {
  return (
    <Box>
      {label && (
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          {label}
        </Typography>
      )}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {emojis.map((emoji) => {
          const isSelected = value === emoji;
          return (
            <Box
              key={emoji}
              component="button"
              type="button"
              onClick={() => onChange(emoji)}
              aria-label={`Select emoji ${emoji}`}
              sx={{
                width: size,
                height: size,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                borderRadius: 1,
                bgcolor: isSelected ? "primary.main" : "action.hover",
                color: isSelected ? "primary.contrastText" : "inherit",
                fontSize: "1.2rem",
                p: 0,
                border: "none",
                outline: "none",
                transition: "all 0.15s ease",
                transform: isSelected ? "scale(1.1)" : "scale(1)",
                "&:hover": {
                  transform: "scale(1.15)",
                },
              }}
            >
              {emoji}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
