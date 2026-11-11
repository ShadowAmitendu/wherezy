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
import TvIcon from "@mui/icons-material/Tv";
import HeadphonesIcon from "@mui/icons-material/Headphones";
import SmartphoneIcon from "@mui/icons-material/Smartphone";
import LaptopIcon from "@mui/icons-material/Laptop";
import RouterIcon from "@mui/icons-material/Router";
import PrintIcon from "@mui/icons-material/Print";
import BatteryChargingFullIcon from "@mui/icons-material/BatteryChargingFull";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import CoffeeMakerIcon from "@mui/icons-material/CoffeeMaker";
import BlenderIcon from "@mui/icons-material/Blender";
import LocalLaundryServiceIcon from "@mui/icons-material/LocalLaundryService";
import HandymanIcon from "@mui/icons-material/Handyman";
import PlumbingIcon from "@mui/icons-material/Plumbing";
import YardIcon from "@mui/icons-material/Yard";
import OutdoorGrillIcon from "@mui/icons-material/OutdoorGrill";
import KeyIcon from "@mui/icons-material/Key";
import DiamondIcon from "@mui/icons-material/Diamond";
import ChildFriendlyIcon from "@mui/icons-material/ChildFriendly";
import ToysIcon from "@mui/icons-material/Toys";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";
import TwoWheelerIcon from "@mui/icons-material/TwoWheeler";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import AcUnitIcon from "@mui/icons-material/AcUnit";
import { LazyMaterialIcon } from "./LazyMaterialIcon";
import { normalizeMaterialIconKey } from "./materialIconCatalog";

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
  { name: "Watch", label: "Watches" },
  { name: "LocalPharmacy", label: "Pharmacy" },
  { name: "Science", label: "Science" },
  { name: "School", label: "Education" },
  { name: "LocalDrink", label: "Drinks" },
  { name: "Fastfood", label: "Food" },
  { name: "Shield", label: "Security" },
  { name: "LocalOffer", label: "Tagged" },
  { name: "Grade", label: "Favorites" },
  { name: "Category", label: "General Category" },
  { name: "Tv", label: "TV & Display" },
  { name: "Headphones", label: "Audio & Headphones" },
  { name: "Smartphone", label: "Phones & Mobile" },
  { name: "Laptop", label: "Laptops & PCs" },
  { name: "Router", label: "Networking & Wi-Fi" },
  { name: "Print", label: "Printers & Scanners" },
  { name: "BatteryChargingFull", label: "Batteries & Power" },
  { name: "Restaurant", label: "Dining & Utensils" },
  { name: "CoffeeMaker", label: "Coffee & Tea" },
  { name: "Blender", label: "Appliances" },
  { name: "LocalLaundryService", label: "Laundry" },
  { name: "Handyman", label: "DIY & Repairs" },
  { name: "Plumbing", label: "Plumbing" },
  { name: "Yard", label: "Garden & Plants" },
  { name: "OutdoorGrill", label: "Outdoor & Patio" },
  { name: "Key", label: "Keys & Locks" },
  { name: "Diamond", label: "Jewelry & Valuables" },
  { name: "ChildFriendly", label: "Baby & Kids" },
  { name: "Toys", label: "Toys & Games" },
  { name: "MenuBook", label: "Manuals & Books" },
  { name: "MedicalServices", label: "First Aid Kit" },
  { name: "TwoWheeler", label: "Bikes & Scooters" },
  { name: "ShoppingBag", label: "Bags & Gear" },
  { name: "AcUnit", label: "Seasonal & Cooling" },
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
  tv: TvIcon,
  headphones: HeadphonesIcon,
  smartphone: SmartphoneIcon,
  laptop: LaptopIcon,
  router: RouterIcon,
  print: PrintIcon,
  batterychargingfull: BatteryChargingFullIcon,
  restaurant: RestaurantIcon,
  coffeemaker: CoffeeMakerIcon,
  blender: BlenderIcon,
  locallaundryservice: LocalLaundryServiceIcon,
  handyman: HandymanIcon,
  plumbing: PlumbingIcon,
  yard: YardIcon,
  outdoorgrill: OutdoorGrillIcon,
  key: KeyIcon,
  diamond: DiamondIcon,
  childfriendly: ChildFriendlyIcon,
  toys: ToysIcon,
  menubook: MenuBookIcon,
  medicalservices: MedicalServicesIcon,
  twowheeler: TwoWheelerIcon,
  shoppingbag: ShoppingBagIcon,
  acunit: AcUnitIcon,
};

/** Check whether a category icon identifier maps synchronously to a curated icon. */
export function hasCuratedCategoryIcon(iconName?: string | null): boolean {
  if (!iconName) return false;
  return Boolean(CURATED_ICON_MAP[normalizeMaterialIconKey(iconName)]);
}

/** Render a curated category icon synchronously or resolve any custom Material Icon lazily. */
export const renderMuiIcon = (
  iconName: string,
  fontSize: "small" | "medium" | "large" = "medium",
) => {
  const trimmed = (iconName || "").trim();
  if (!trimmed) {
    return React.createElement(CategoryIcon, { fontSize });
  }
  const key = normalizeMaterialIconKey(trimmed);
  const CuratedComponent = CURATED_ICON_MAP[key];
  if (CuratedComponent) {
    return React.createElement(CuratedComponent, { fontSize });
  }
  return React.createElement(LazyMaterialIcon, {
    icon: trimmed,
    fallbackType: "category",
    fontSize,
  });
};
