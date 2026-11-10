import React from "react";
import { Snackbar, Button, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

interface UndoSnackbarProps {
  open: boolean;
  message: string;
  onUndo: () => void;
  onClose: () => void;
  autoHideDuration?: number;
}

export const UndoSnackbar: React.FC<UndoSnackbarProps> = ({
  open,
  message,
  onUndo,
  onClose,
  autoHideDuration = 10000,
}) => {
  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      message={message}
      action={
        <React.Fragment>
          <Button color="secondary" size="small" onClick={onUndo} sx={{ fontWeight: 700 }}>
            UNDO
          </Button>
          <IconButton size="small" aria-label="close" color="inherit" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </React.Fragment>
      }
    />
  );
};
