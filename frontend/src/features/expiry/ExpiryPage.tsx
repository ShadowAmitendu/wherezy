import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { PageHeader } from "../../components/shared/PageHeader";
import { EmptyState } from "../../components/shared/EmptyState";
import { ExpiryChip } from "../../components/shared/ExpiryChip";
import { CoverThumb } from "../photos/CoverThumb";
import { ItemDetailDialog } from "../items/ItemDetailDialog";
import { api } from "../../api/client";
import { Item } from "../items/types";

export const ExpiryPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<string>(searchParams.get("filter") || "all");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadExpiringItems = async () => {
    try {
      setIsLoading(true);
      const res = await api.getExpiring(365); // fetch within 1 year
      setItems(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadExpiringItems();
  }, []);

  const filteredItems = items.filter((it) => {
    if (filter === "expired") return it.expiry_status === "expired";
    if (filter === "soon") return it.expiry_status === "soon";
    if (filter === "ok") return it.expiry_status === "ok";
    return true;
  });

  return (
    <Box>
      <PageHeader
        title="Expiry Tracking"
        subtitle="Keep track of expiration dates on medicines, consumables, warranties, and documents"
        action={
          <ToggleButtonGroup
            size="small"
            value={filter}
            exclusive
            onChange={(_, val) => val && setFilter(val)}
            sx={{ flexWrap: "wrap" }}
          >
            <ToggleButton value="all">All ({items.length})</ToggleButton>
            <ToggleButton value="expired" color="error">
              Expired ({items.filter((i) => i.expiry_status === "expired").length})
            </ToggleButton>
            <ToggleButton value="soon" color="warning">
              Soon ({items.filter((i) => i.expiry_status === "soon").length})
            </ToggleButton>
            <ToggleButton value="ok" color="success">
              Valid ({items.filter((i) => i.expiry_status === "ok").length})
            </ToggleButton>
          </ToggleButtonGroup>
        }
      />

      {filteredItems.length === 0 && !isLoading ? (
        <EmptyState
          title="No Expiring Items"
          description={
            filter === "all"
              ? "No items currently have an expiry date set."
              : `No items matched the '${filter}' filter.`
          }
        />
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell width={50}></TableCell>
                  <TableCell>Item Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Expiry Date</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.map((it) => (
                  <TableRow
                    key={it.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => setSelectedItemId(it.id)}
                  >
                    <TableCell>
                      <CoverThumb thumbUrl={it.cover_thumb_url} size={36} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {it.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                        I{it.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={it.category_name || "—"}
                        size="small"
                        sx={{
                          bgcolor: `${it.category_color}20`,
                          color: it.category_color || "inherit",
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell>{it.location_path || "—"}</TableCell>
                    <TableCell>{it.expiry_date || "—"}</TableCell>
                    <TableCell>
                      <ExpiryChip status={it.expiry_status} dateStr={it.expiry_date} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Item Detail Dialog */}
      <ItemDetailDialog
        itemId={selectedItemId}
        open={Boolean(selectedItemId)}
        onClose={() => setSelectedItemId(null)}
        onEdit={() => {}}
        onDelete={() => {
          setSelectedItemId(null);
          loadExpiringItems();
        }}
        onMove={() => {
          loadExpiringItems();
        }}
        onItemUpdated={loadExpiringItems}
      />
    </Box>
  );
};
