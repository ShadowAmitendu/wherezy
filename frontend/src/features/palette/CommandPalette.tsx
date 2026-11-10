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
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogContent sx={{ p: 2 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Search items, locations, categories, tags, contacts, actions..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
              ) : (
                <Chip label="ESC" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.65rem" }} />
              ),
            },
          }}
          sx={{ mb: 1.5 }}
        />

        {results.length > 0 ? (
          <List disablePadding sx={{ maxHeight: 380, overflowY: "auto" }}>
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
        ) : query.trim() && !loading ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No matching results found for &quot;{query}&quot;.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary">
              Tip: Press <kbd style={{ padding: "2px 6px", background: "rgba(128,128,128,0.2)", borderRadius: 4 }}>Ctrl</kbd> + <kbd style={{ padding: "2px 6px", background: "rgba(128,128,128,0.2)", borderRadius: 4 }}>K</kbd> anywhere to quickly search.
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};
