import React, { type ComponentType } from "react";
import type { SvgIconProps } from "@mui/material";
import MedicationIcon from "@mui/icons-material/Medication";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import ConstructionIcon from "@mui/icons-material/Construction";
import DescriptionIcon from "@mui/icons-material/Description";
import KitchenIcon from "@mui/icons-material/Kitchen";
import DevicesIcon from "@mui/icons-material/Devices";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import InventoryIcon from "@mui/icons-material/Inventory";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import HomeIcon from "@mui/icons-material/Home";
import FolderIcon from "@mui/icons-material/Folder";
import BookIcon from "@mui/icons-material/Book";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import PetsIcon from "@mui/icons-material/Pets";
import PaletteIcon from "@mui/icons-material/Palette";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import ChairIcon from "@mui/icons-material/Chair";
import BuildIcon from "@mui/icons-material/Build";
import WeekendIcon from "@mui/icons-material/Weekend";
import BedIcon from "@mui/icons-material/Bed";
import CleanHandsIcon from "@mui/icons-material/CleanHands";
import ElectricalServicesIcon from "@mui/icons-material/ElectricalServices";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import LuggageIcon from "@mui/icons-material/Luggage";
import WatchIcon from "@mui/icons-material/Watch";
import LocalPharmacyIcon from "@mui/icons-material/LocalPharmacy";
import ScienceIcon from "@mui/icons-material/Science";
import SchoolIcon from "@mui/icons-material/School";
import LocalDrinkIcon from "@mui/icons-material/LocalDrink";
import FastfoodIcon from "@mui/icons-material/Fastfood";
import ShieldIcon from "@mui/icons-material/Shield";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import GradeIcon from "@mui/icons-material/Grade";
import CategoryIcon from "@mui/icons-material/Category";
import InboxIcon from "@mui/icons-material/Inbox";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";

export const CURATED_ICONS: { name: string; label: string }[] = [
  { name: "Medication", label: "Medication" },
  { name: "Lightbulb", label: "Lightbulb" },
  { name: "Construction", label: "Tools" },
  { name: "Description", label: "Document" },
  { name: "Kitchen", label: "Kitchen" },
  { name: "Devices", label: "Electronics" },
  { name: "Checkroom", label: "Clothes" },
  { name: "LocalShipping", label: "Moving / Storage" },
  { name: "Inventory", label: "Inventory" },
  { name: "Home", label: "Home" },
  { name: "Folder", label: "Folder" },
  { name: "Book", label: "Book" },
  { name: "SportsEsports", label: "Gaming" },
  { name: "FitnessCenter", label: "Fitness" },
  { name: "Pets", label: "Pets" },
  { name: "Palette", label: "Art / Craft" },
  { name: "MusicNote", label: "Music" },
  { name: "CameraAlt", label: "Camera" },
  { name: "Chair", label: "Furniture" },
  { name: "Build", label: "Hardware" },
  { name: "Weekend", label: "Living" },
  { name: "Bed", label: "Bedroom" },
  { name: "CleanHands", label: "Cleaning" },
  { name: "ElectricalServices", label: "Cables / Electrical" },
  { name: "DirectionsCar", label: "Automotive" },
  { name: "Luggage", label: "Travel" },
  { name: "Watch", label: "Watches / Jewelry" },
  { name: "LocalPharmacy", label: "First Aid" },
  { name: "Science", label: "Science" },
  { name: "School", label: "Education" },
  { name: "LocalDrink", label: "Drinks" },
  { name: "Fastfood", label: "Food" },
  { name: "Shield", label: "Security" },
  { name: "LocalOffer", label: "Tagged" },
  { name: "Grade", label: "Valuables" },
  { name: "Category", label: "General Category" },
];

const CURATED_ICON_MAP: Record<string, ComponentType<SvgIconProps>> = {
  medication: MedicationIcon,
  lightbulb: LightbulbIcon,
  construction: ConstructionIcon,
  description: DescriptionIcon,
  kitchen: KitchenIcon,
  devices: DevicesIcon,
  checkroom: CheckroomIcon,
  localshipping: LocalShippingIcon,
  inventory: InventoryIcon,
  inventory2: Inventory2Icon,
  home: HomeIcon,
  folder: FolderIcon,
  book: BookIcon,
  sportsesports: SportsEsportsIcon,
  fitnesscenter: FitnessCenterIcon,
  pets: PetsIcon,
  palette: PaletteIcon,
  musicnote: MusicNoteIcon,
  cameraalt: CameraAltIcon,
  chair: ChairIcon,
  build: BuildIcon,
  weekend: WeekendIcon,
  bed: BedIcon,
  cleanhands: CleanHandsIcon,
  electricalservices: ElectricalServicesIcon,
  directionscar: DirectionsCarIcon,
  luggage: LuggageIcon,
  watch: WatchIcon,
  localpharmacy: LocalPharmacyIcon,
  science: ScienceIcon,
  school: SchoolIcon,
  localdrink: LocalDrinkIcon,
  fastfood: FastfoodIcon,
  shield: ShieldIcon,
  localoffer: LocalOfferIcon,
  grade: GradeIcon,
  category: CategoryIcon,
  inbox: InboxIcon,
  createnewfolder: CreateNewFolderIcon,
};

/** Render a curated category or template icon without importing the full icon pack. */
export const renderMuiIcon = (
  iconName: string,
  fontSize: "small" | "medium" | "large" = "medium"
) => {
  const key = (iconName || "").replaceAll("_", "").toLowerCase();
  const IconComponent = CURATED_ICON_MAP[key] || CategoryIcon;
  return React.createElement(IconComponent, { fontSize });
};
