import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Fade,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import BoltIcon from "@mui/icons-material/Bolt";
import { api } from "../../api/client";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [prevOpen, setPrevOpen] = useState(open);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }

  useEffect(() => {
    if (!query.trim()) {
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.quickSearch(query.trim());
        setResults(res.results || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (url: string) => {
    onClose();
    navigate(url);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "item":
        return <Inventory2OutlinedIcon color="primary" fontSize="small" />;
      case "location":
        return <PlaceOutlinedIcon color="secondary" fontSize="small" />;
      case "category":
        return <CategoryOutlinedIcon color="info" fontSize="small" />;
      case "tag":
        return <LocalOfferOutlinedIcon color="warning" fontSize="small" />;
      case "contact":
        return <PersonOutlinedIcon color="success" fontSize="small" />;
      default:
        return <BoltIcon color="action" fontSize="small" />;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
      <DialogContent sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <TextField
            autoFocus
            fullWidth
            placeholder={isMobile ? "Search inventory..." : "Search items, locations, categories, tags, contacts, actions..."}
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              if (!next.trim()) setResults([]);
            }}
            variant="outlined"
            size="medium"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: loading ? (
                  <InputAdornment position="end">
                    <CircularProgress size={20} />
                  </InputAdornment>
                ) : !isMobile ? (
                  <Chip
                    label="ESC"
                    size="small"
                    variant="outlined"
                    onClick={onClose}
                    sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer" }}
                  />
                ) : undefined,
              },
            }}
          />
          {isMobile && (
            <IconButton onClick={onClose} aria-label="Close search" size="medium" sx={{ flexShrink: 0 }}>
              <CloseIcon />
            </IconButton>
          )}
        </Box>

        {results.length > 0 ? (
          <Fade in appear timeout={180}>
            <List disablePadding sx={{ maxHeight: isMobile ? "calc(100vh - 110px)" : 380, overflowY: "auto" }}>
              {results.map((r, i) => (
                <ListItem key={i} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => handleSelect(r.url)}
                    sx={{ borderRadius: 1, py: 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>{getIcon(r.type)}</ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {r.title}
                          </Typography>
                          <Chip
                            label={r.type}
                            size="small"
                            sx={{ height: 18, fontSize: "0.65rem", textTransform: "capitalize" }}
                          />
                        </Box>
                      }
                      secondary={r.subtitle}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Fade>
        ) : query.trim() && !loading ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No matching results found for &quot;{query}&quot;.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary">
              {isMobile ? (
                "Type to search items, locations, categories, or contacts."
              ) : (
                <>
                  Tip: Press <kbd style={{ padding: "2px 6px", background: "rgba(128,128,128,0.2)", borderRadius: 4 }}>Ctrl</kbd> + <kbd style={{ padding: "2px 6px", background: "rgba(128,128,128,0.2)", borderRadius: 4 }}>K</kbd> anywhere to quickly search.
                </>
              )}
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};
