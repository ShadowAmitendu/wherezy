import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import SearchIcon from "@mui/icons-material/Search";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import AssignmentReturnOutlinedIcon from "@mui/icons-material/AssignmentReturnOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { api, ApiException } from "../../api/client";
import { ItemDetailDialog } from "../items/ItemDetailDialog";

export const ContactsPage: React.FC = () => {
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add / Edit Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  // Contact Loans Drawer / Dialog state
  const [loansContact, setLoansContact] = useState<any | null>(null);
  const [loansData, setLoansData] = useState<{ active_loans: any[]; returned_loans: any[] }>({
    active_loans: [],
    returned_loans: [],
  });
  const [loadingLoans, setLoadingLoans] = useState(false);

  // Selected item detail
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const data = await api.getContacts();
      setContacts(data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.error?.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const handleOpenAdd = () => {
    setEditingContact(null);
    setName("");
    setPhone("");
    setNote("");
    setDialogOpen(true);
  };

  const handleOpenEdit = (c: any) => {
    setEditingContact(c);
    setName(c.name || "");
    setPhone(c.phone || "");
    setNote(c.note || "");
    setDialogOpen(true);
  };

  const handleSaveContact = async () => {
    if (!name.trim()) {
      setErrorMsg("Contact name is required");
      return;
    }
    try {
      if (editingContact) {
        await api.updateContact(editingContact.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          note: note.trim() || undefined,
        });
        setSuccessMsg("Contact updated successfully");
      } else {
        await api.createContact({
          name: name.trim(),
          phone: phone.trim() || undefined,
          note: note.trim() || undefined,
        });
        setSuccessMsg("Contact created successfully");
      }
      setDialogOpen(false);
      loadContacts();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to save contact");
    }
  };

  const handleDeactivate = async (contact: any) => {
    if (!window.confirm(`Are you sure you want to remove or deactivate '${contact.name}'?`)) return;
    try {
      await api.deleteContact(contact.id);
      setSuccessMsg(`Contact '${contact.name}' deactivated`);
      loadContacts();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to deactivate contact");
    }
  };

  const handleOpenLoans = async (contact: any) => {
    setLoansContact(contact);
    setLoadingLoans(true);
    try {
      const data = await api.getContactLoans(contact.id);
      setLoansData(data);
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to fetch loan history");
    } finally {
      setLoadingLoans(false);
    }
  };

  const handleReturnItem = async (itemId: number) => {
    try {
      await api.toggleTaken(itemId, false);
      setSuccessMsg("Item marked as returned");
      if (loansContact) {
        const data = await api.getContactLoans(loansContact.id);
        setLoansData(data);
      }
      loadContacts();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to return item");
    }
  };

  const handleCopyPhone = (text: string) => {
    navigator.clipboard?.writeText(text);
    setSuccessMsg("Phone number copied to clipboard");
  };

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone && c.phone.toLowerCase().includes(search.toLowerCase())) ||
    (c.note && c.note.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      {/* Page Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <PeopleOutlinedIcon color="primary" sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Contacts & Lending
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Keep track of friends, neighbors, and contacts who borrow household tools and items
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<PersonAddOutlinedIcon />} onClick={handleOpenAdd}>
          Add Contact
        </Button>
      </Box>

      {errorMsg && (
        <Alert severity="error" variant="filled" onClose={() => setErrorMsg(null)} sx={{ mb: 2 }}>
          {errorMsg}
        </Alert>
      )}

      {successMsg && (
        <Alert severity="success" variant="filled" onClose={() => setSuccessMsg(null)} sx={{ mb: 2 }}>
          {successMsg}
        </Alert>
      )}

      {/* Search Bar */}
      <TextField
        fullWidth
        placeholder="Search contacts by name, phone, or note..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 3 }}
      />

      {/* Contacts Grid */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : filteredContacts.length === 0 ? (
        <Card variant="outlined" sx={{ p: 6, textAlign: "center", borderRadius: 1 }}>
          <PeopleOutlinedIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            No contacts found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add contacts to easily record who borrowed items and track return dates.
          </Typography>
          <Button variant="outlined" onClick={handleOpenAdd}>
            Add First Contact
          </Button>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {filteredContacts.map((contact) => {
            const hasLoans = contact.items_out_count > 0;
            const hasOverdue = contact.has_overdue;

            return (
              <Grid key={contact.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column", borderRadius: 1 }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {contact.name}
                      </Typography>
                      {hasLoans && (
                        <Chip
                          label={hasOverdue ? `${contact.items_out_count} Lent (Overdue)` : `${contact.items_out_count} Lent`}
                          size="small"
                          color={hasOverdue ? "error" : "primary"}
                          icon={hasOverdue ? <WarningAmberOutlinedIcon /> : <Inventory2OutlinedIcon />}
                          sx={{ fontWeight: 600 }}
                        />
                      )}
                    </Box>

                    {contact.phone && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 1 }}>
                        <PhoneOutlinedIcon fontSize="small" color="action" />
                        <Typography
                          variant="body2"
                          component="a"
                          href={`tel:${contact.phone}`}
                          sx={{ color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                        >
                          {contact.phone}
                        </Typography>
                        <Tooltip title="Copy phone number">
                          <IconButton size="small" onClick={() => handleCopyPhone(contact.phone)}>
                            <ContentCopyIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}

                    {contact.note && (
                      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5, mt: 1 }}>
                        <NotesOutlinedIcon fontSize="small" color="action" sx={{ mt: 0.2 }} />
                        <Typography variant="body2" color="text.secondary">
                          {contact.note}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>

                  <Divider />

                  <CardActions sx={{ justifyContent: "space-between", px: 2, py: 1 }}>
                    <Button size="small" onClick={() => handleOpenLoans(contact)}>
                      View Loans ({contact.items_out_count || 0})
                    </Button>
                    <Box>
                      <Tooltip title="Edit Contact">
                        <IconButton size="small" onClick={() => handleOpenEdit(contact)}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Deactivate Contact">
                        <IconButton size="small" color="error" onClick={() => handleDeactivate(contact)}>
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Add / Edit Contact Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingContact ? "Edit Contact" : "Add New Contact"}</DialogTitle>
        <DialogContent sx={{ pt: "24px !important", display: "flex", flexDirection: "column", gap: 2.5 }}>
          <TextField
            label="Name"
            placeholder="e.g. John Doe, Neighbor Dave"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
            sx={{ mt: 1 }}
          />
          <TextField
            label="Phone Number (Optional)"
            placeholder="e.g. +1 555-0199"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fullWidth
          />
          <TextField
            label="Note (Optional)"
            placeholder="e.g. Lives next door at #42, borrowed pressure washer"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveContact}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Loans History Dialog */}
      <Dialog open={Boolean(loansContact)} onClose={() => setLoansContact(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          Loans for {loansContact?.name}
        </DialogTitle>
        <DialogContent sx={{ pt: "20px !important" }}>
          {loadingLoans ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {/* Active Loans */}
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Currently Has Out ({loansData.active_loans.length})
                </Typography>
                {loansData.active_loans.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No items currently out to this contact.
                  </Typography>
                ) : (
                  <List disablePadding>
                    {loansData.active_loans.map((item: any) => (
                      <ListItem
                        key={item.id}
                        sx={{
                          mb: 1,
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 1,
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <Inventory2OutlinedIcon color="primary" />
                          <ListItemText
                            primary={
                              <Typography
                                variant="subtitle2"
                                sx={{ fontWeight: 600, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                                onClick={() => setSelectedItemId(item.id)}
                              >
                                {item.name}
                              </Typography>
                            }
                            secondary={`Taken: ${item.taken_at ? item.taken_at.substring(0, 10) : "N/A"}${
                              item.taken_due ? ` • Due: ${item.taken_due}` : ""
                            }`}
                          />
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          {item.is_overdue && (
                            <Chip label="Overdue" size="small" color="error" />
                          )}
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AssignmentReturnOutlinedIcon />}
                            onClick={() => handleReturnItem(item.id)}
                          >
                            Mark Returned
                          </Button>
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>

              <Divider />

              {/* Past Loans */}
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Returned Before ({loansData.returned_loans.length})
                </Typography>
                {loansData.returned_loans.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No previous loan history recorded.
                  </Typography>
                ) : (
                  <List disablePadding>
                    {loansData.returned_loans.map((l: any, idx: number) => (
                      <ListItem
                        key={idx}
                        sx={{
                          mb: 0.5,
                          borderBottom: "1px solid",
                          borderColor: "divider",
                          px: 1,
                        }}
                      >
                        <ListItemText
                          primary={l.item_name || `Item #${l.item_id}`}
                          secondary={`Returned: ${l.returned_at ? l.returned_at.substring(0, 10) : "N/A"}${
                            l.days_out ? ` (${l.days_out} days out)` : ""
                          }`}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoansContact(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Item Detail Modal */}
      <ItemDetailDialog
        itemId={selectedItemId}
        open={Boolean(selectedItemId)}
        onClose={() => setSelectedItemId(null)}
        onUpdated={() => {
          loadContacts();
          if (loansContact) handleOpenLoans(loansContact);
        }}
        onDeleted={() => {
          setSelectedItemId(null);
          loadContacts();
        }}
      />
    </Box>
  );
};