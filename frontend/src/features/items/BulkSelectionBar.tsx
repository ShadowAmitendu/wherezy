import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ClearOutlinedIcon from "@mui/icons-material/ClearOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";

export interface BulkSelectionBarProps {
  selectedCount: number;
  canWrite: boolean;
  busy?: boolean;
  onClear: () => void;
  onMove: () => void;
  onManageTags: () => void;
  onMarkTakenOut: () => void;
  onMarkReturned: () => void;
  onSetExpiry: () => void;
  onPackInBox: () => void;
  onRetire: () => void;
  onPrintLabels: () => void;
  onDelete: () => void;
}

export const BulkSelectionBar: React.FC<BulkSelectionBarProps> = ({
  selectedCount,
  canWrite,
  busy = false,
  onClear,
  onMove,
  onManageTags,
  onMarkTakenOut,
  onMarkReturned,
  onSetExpiry,
  onPackInBox,
  onRetire,
  onPrintLabels,
  onDelete,
}) => {
  const [moreAnchorEl, setMoreAnchorEl] = useState<HTMLElement | null>(null);
  const moreOpen = Boolean(moreAnchorEl);

  const handleCloseMore = () => setMoreAnchorEl(null);

  const triggerMoreAction = (fn: () => void) => {
    handleCloseMore();
    fn();
  };

  return (
    <Collapse in={selectedCount > 0} unmountOnExit>
      <Box
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.25,
          px: 2,
          py: 1.25,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: alpha(
            theme.palette.primary.main,
            theme.palette.mode === "dark" ? 0.14 : 0.08
          ),
        })}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            size="small"
            color="primary"
            label={`${selectedCount} ${selectedCount === 1 ? "item" : "items"} selected`}
            sx={{ fontWeight: 700 }}
          />
          <Button
            size="small"
            startIcon={<ClearOutlinedIcon />}
            onClick={onClear}
            disabled={busy}
          >
            Clear
          </Button>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          {canWrite && (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DriveFileMoveOutlinedIcon />}
                onClick={onMove}
                disabled={busy}
              >
                Move
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<LocalOfferOutlinedIcon />}
                onClick={onManageTags}
                disabled={busy}
              >
                Tags
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SwapHorizOutlinedIcon />}
                endIcon={<ExpandMoreIcon />}
                onClick={(e) => setMoreAnchorEl(e.currentTarget)}
                disabled={busy}
              >
                More Actions
              </Button>
              <Menu
                anchorEl={moreAnchorEl}
                open={moreOpen}
                onClose={handleCloseMore}
              >
                <MenuItem onClick={() => triggerMoreAction(onMarkTakenOut)}>
                  <ListItemIcon>
                    <RemoveCircleOutlineOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Mark Taken Out...</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => triggerMoreAction(onMarkReturned)}>
                  <ListItemIcon>
                    <CheckCircleOutlineOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Mark Returned (In Place)</ListItemText>
                </MenuItem>
                <Divider />
                <MenuItem onClick={() => triggerMoreAction(onSetExpiry)}>
                  <ListItemIcon>
                    <EventOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Set Expiry Date...</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => triggerMoreAction(onPackInBox)}>
                  <ListItemIcon>
                    <Inventory2OutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Pack into Box...</ListItemText>
                </MenuItem>
                <Divider />
                <MenuItem onClick={() => triggerMoreAction(onRetire)}>
                  <ListItemIcon>
                    <ArchiveOutlinedIcon fontSize="small" color="warning" />
                  </ListItemIcon>
                  <ListItemText>Retire Selected...</ListItemText>
                </MenuItem>
              </Menu>
            </>
          )}

          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintOutlinedIcon />}
            onClick={onPrintLabels}
            disabled={busy}
          >
            Print Labels
          </Button>

          {canWrite && (
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlinedIcon />}
              onClick={onDelete}
              disabled={busy}
            >
              Delete
            </Button>
          )}
        </Box>
      </Box>
    </Collapse>
  );
};
