import type { ComponentType } from "react";
import type { SvgIconProps } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import FaceIcon from "@mui/icons-material/Face";
import Face3Icon from "@mui/icons-material/Face3";
import Face4Icon from "@mui/icons-material/Face4";
import Face6Icon from "@mui/icons-material/Face6";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import EngineeringIcon from "@mui/icons-material/Engineering";
import HomeIcon from "@mui/icons-material/Home";
import PetsIcon from "@mui/icons-material/Pets";
import SecurityIcon from "@mui/icons-material/Security";
import StarIcon from "@mui/icons-material/Star";
import FavoriteIcon from "@mui/icons-material/Favorite";
import BuildIcon from "@mui/icons-material/Build";
import PaletteIcon from "@mui/icons-material/Palette";
import SchoolIcon from "@mui/icons-material/School";
import WorkIcon from "@mui/icons-material/Work";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import LocalFloristIcon from "@mui/icons-material/LocalFlorist";
import KeyIcon from "@mui/icons-material/Key";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import BoltIcon from "@mui/icons-material/Bolt";

export const ACCOUNT_ICONS: { name: string; label: string }[] = [
  { name: "Person", label: "Individual / Member" },
  { name: "AdminPanelSettings", label: "Administrator" },
  { name: "SupervisorAccount", label: "Co-Admin / Manager" },
  { name: "Face", label: "User Face" },
  { name: "Face3", label: "Woman" },
  { name: "Face4", label: "Man" },
  { name: "Face6", label: "Elder" },
  { name: "ChildCare", label: "Child / Kid" },
  { name: "Engineering", label: "Technician / Engineer" },
  { name: "Home", label: "Household / Family" },
  { name: "Pets", label: "Family Pet" },
  { name: "Security", label: "Security Guard" },
  { name: "Star", label: "VIP / Favorite" },
  { name: "Favorite", label: "Loved One" },
  { name: "Build", label: "Craftsman / DIY" },
  { name: "Palette", label: "Artist / Creative" },
  { name: "School", label: "Student / Scholar" },
  { name: "Work", label: "Professional / Office" },
  { name: "SportsEsports", label: "Gamer" },
  { name: "FitnessCenter", label: "Fitness / Athlete" },
  { name: "LocalFlorist", label: "Gardener" },
  { name: "Key", label: "Keys / Access" },
  { name: "AutoAwesome", label: "Special / Magic" },
  { name: "AccountCircle", label: "Standard Account" },
];

export const EMOJI_TO_ICON_MAP: Record<string, string> = {
  "👤": "Person",
  "🧑‍💻": "Engineering",
  "👑": "AdminPanelSettings",
  "🦊": "Pets",
  "🐱": "Pets",
  "🏡": "Home",
  "📦": "Inventory2",
  "⭐": "Star",
  "🔑": "Key",
  "🎨": "Palette",
  "🛠️": "Build",
  "🌸": "LocalFlorist",
  "⚡": "Bolt",
  "🍎": "Favorite",
  "🚀": "AutoAwesome",
  "👩": "Face3",
  "👨": "Face4",
};

const ACCOUNT_ICON_MAP: Record<string, ComponentType<SvgIconProps>> = {
  person: PersonIcon,
  adminpanelsettings: AdminPanelSettingsIcon,
  supervisoraccount: SupervisorAccountIcon,
  face: FaceIcon,
  face3: Face3Icon,
  face4: Face4Icon,
  face6: Face6Icon,
  childcare: ChildCareIcon,
  engineering: EngineeringIcon,
  home: HomeIcon,
  pets: PetsIcon,
  security: SecurityIcon,
  star: StarIcon,
  favorite: FavoriteIcon,
  build: BuildIcon,
  palette: PaletteIcon,
  school: SchoolIcon,
  work: WorkIcon,
  sportsesports: SportsEsportsIcon,
  fitnesscenter: FitnessCenterIcon,
  localflorist: LocalFloristIcon,
  key: KeyIcon,
  autoawesome: AutoAwesomeIcon,
  accountcircle: AccountCircleIcon,
  inventory2: Inventory2Icon,
  bolt: BoltIcon,
};

/** Resolve an emoji or icon identifier to a bundled MUI account icon component. */
export const getAccountIconComponent = (iconName?: string | null): ComponentType<SvgIconProps> => {
  if (!iconName) return PersonIcon;
  const mapped = EMOJI_TO_ICON_MAP[iconName] || iconName;
  const key = mapped.replaceAll("_", "").toLowerCase();
  return ACCOUNT_ICON_MAP[key] || PersonIcon;
};
