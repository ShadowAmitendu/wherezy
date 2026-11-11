import React from "react";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import HealingOutlinedIcon from "@mui/icons-material/HealingOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import QrCodeScannerOutlinedIcon from "@mui/icons-material/QrCodeScannerOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ManageAccountsOutlinedIcon from "@mui/icons-material/ManageAccountsOutlined";

export interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

export interface NavCategory {
  id: string;
  title: string;
  items: NavItem[];
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    id: "inventory",
    title: "Inventory",
    items: [
      { label: "Dashboard", path: "/", icon: <DashboardOutlinedIcon /> },
      { label: "Items", path: "/items", icon: <Inventory2OutlinedIcon /> },
      { label: "Categories", path: "/categories", icon: <CategoryOutlinedIcon /> },
      { label: "Locations", path: "/locations", icon: <PlaceOutlinedIcon /> },
    ],
  },
  {
    id: "tools",
    title: "Tools & Alerts",
    items: [
      { label: "Inbox", path: "/inbox", icon: <MoveToInboxOutlinedIcon /> },
      { label: "Scan Code", path: "/scan", icon: <QrCodeScannerOutlinedIcon /> },
      { label: "Reminders", path: "/reminders", icon: <NotificationsOutlinedIcon /> },
    ],
  },
  {
    id: "tracking",
    title: "Tracking & Logs",
    items: [
      { label: "Moves", path: "/moves", icon: <LocalShippingOutlinedIcon /> },
      { label: "Contacts", path: "/contacts", icon: <PeopleOutlinedIcon /> },
      { label: "Activity", path: "/activity", icon: <HistoryOutlinedIcon /> },
    ],
  },
  {
    id: "system",
    title: "System",
    items: [
      { label: "Health", path: "/health", icon: <HealingOutlinedIcon /> },
      { label: "Trash", path: "/trash", icon: <DeleteOutlinedIcon /> },
      { label: "Users", path: "/users", icon: <ManageAccountsOutlinedIcon />, adminOnly: true },
      { label: "Settings", path: "/settings", icon: <SettingsOutlinedIcon /> },
    ],
  },
];
