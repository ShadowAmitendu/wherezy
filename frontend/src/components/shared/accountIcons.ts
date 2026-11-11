import type { ComponentType } from "react";
import type { SvgIconProps } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import FaceIcon from "@mui/icons-material/Face";
import Face2Icon from "@mui/icons-material/Face2";
import Face3Icon from "@mui/icons-material/Face3";
import Face4Icon from "@mui/icons-material/Face4";
import Face5Icon from "@mui/icons-material/Face5";
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
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import BadgeIcon from "@mui/icons-material/Badge";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import SelfImprovementIcon from "@mui/icons-material/SelfImprovement";
import SentimentSatisfiedAltIcon from "@mui/icons-material/SentimentSatisfiedAlt";
import MoodIcon from "@mui/icons-material/Mood";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import HeadphonesIcon from "@mui/icons-material/Headphones";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import BrushIcon from "@mui/icons-material/Brush";
import ScienceIcon from "@mui/icons-material/Science";
import CodeIcon from "@mui/icons-material/Code";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import DirectionsBikeIcon from "@mui/icons-material/DirectionsBike";
import HikingIcon from "@mui/icons-material/Hiking";
import FlightIcon from "@mui/icons-material/Flight";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import CoffeeIcon from "@mui/icons-material/Coffee";
import CakeIcon from "@mui/icons-material/Cake";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import VolunteerActivismIcon from "@mui/icons-material/VolunteerActivism";
import { normalizeMaterialIconKey } from "./materialIconCatalog";

export const ACCOUNT_ICONS: { name: string; label: string }[] = [
  { name: "Person", label: "Individual / Member" },
  { name: "AdminPanelSettings", label: "Administrator" },
  { name: "SupervisorAccount", label: "Co-Admin / Manager" },
  { name: "ManageAccounts", label: "Account Manager" },
  { name: "AccountCircle", label: "Standard Account" },
  { name: "Badge", label: "ID Badge" },
  { name: "VerifiedUser", label: "Verified Member" },
  { name: "Face", label: "User Face" },
  { name: "Face2", label: "Portrait 2" },
  { name: "Face3", label: "Woman" },
  { name: "Face4", label: "Man" },
  { name: "Face5", label: "Portrait 5" },
  { name: "Face6", label: "Elder" },
  { name: "ChildCare", label: "Child / Kid" },
  { name: "SentimentSatisfiedAlt", label: "Happy" },
  { name: "Mood", label: "Cheerful" },
  { name: "SelfImprovement", label: "Mindful / Zen" },
  { name: "Engineering", label: "Technician / Engineer" },
  { name: "Code", label: "Developer / Coder" },
  { name: "Science", label: "Scientist / Lab" },
  { name: "Home", label: "Household / Family" },
  { name: "Pets", label: "Family Pet" },
  { name: "Security", label: "Security Guard" },
  { name: "Star", label: "VIP / Favorite" },
  { name: "Favorite", label: "Loved One" },
  { name: "VolunteerActivism", label: "Caregiver" },
  { name: "EmojiEvents", label: "Champion" },
  { name: "Build", label: "Craftsman / DIY" },
  { name: "Palette", label: "Artist / Creative" },
  { name: "Brush", label: "Painter" },
  { name: "CameraAlt", label: "Photographer" },
  { name: "MusicNote", label: "Musician" },
  { name: "Headphones", label: "Music Lover" },
  { name: "MenuBook", label: "Reader" },
  { name: "School", label: "Student / Scholar" },
  { name: "Work", label: "Professional / Office" },
  { name: "SportsEsports", label: "Gamer" },
  { name: "FitnessCenter", label: "Fitness / Athlete" },
  { name: "DirectionsBike", label: "Cyclist" },
  { name: "Hiking", label: "Hiker / Outdoors" },
  { name: "Flight", label: "Traveler" },
  { name: "LocalFlorist", label: "Gardener" },
  { name: "Restaurant", label: "Home Chef" },
  { name: "Coffee", label: "Coffee Lover" },
  { name: "Cake", label: "Baker / Celebration" },
  { name: "Key", label: "Keys / Access" },
  { name: "AutoAwesome", label: "Special / Magic" },
  { name: "RocketLaunch", label: "Maker / Explorer" },
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
  manageaccounts: ManageAccountsIcon,
  badge: BadgeIcon,
  verifieduser: VerifiedUserIcon,
  face: FaceIcon,
  face2: Face2Icon,
  face3: Face3Icon,
  face4: Face4Icon,
  face5: Face5Icon,
  face6: Face6Icon,
  childcare: ChildCareIcon,
  sentimentsatisfiedalt: SentimentSatisfiedAltIcon,
  mood: MoodIcon,
  selfimprovement: SelfImprovementIcon,
  engineering: EngineeringIcon,
  code: CodeIcon,
  science: ScienceIcon,
  home: HomeIcon,
  pets: PetsIcon,
  security: SecurityIcon,
  star: StarIcon,
  favorite: FavoriteIcon,
  volunteeractivism: VolunteerActivismIcon,
  emojievents: EmojiEventsIcon,
  build: BuildIcon,
  palette: PaletteIcon,
  brush: BrushIcon,
  cameraalt: CameraAltIcon,
  musicnote: MusicNoteIcon,
  headphones: HeadphonesIcon,
  menubook: MenuBookIcon,
  school: SchoolIcon,
  work: WorkIcon,
  sportsesports: SportsEsportsIcon,
  fitnesscenter: FitnessCenterIcon,
  directionsbike: DirectionsBikeIcon,
  hiking: HikingIcon,
  flight: FlightIcon,
  localflorist: LocalFloristIcon,
  restaurant: RestaurantIcon,
  coffee: CoffeeIcon,
  cake: CakeIcon,
  key: KeyIcon,
  autoawesome: AutoAwesomeIcon,
  rocketlaunch: RocketLaunchIcon,
  accountcircle: AccountCircleIcon,
  inventory2: Inventory2Icon,
  bolt: BoltIcon,
};

/** Resolve legacy emoji mapping before normalizing an account icon name. */
export function resolveAccountIconName(iconName?: string | null): string {
  if (!iconName) return "Person";
  return EMOJI_TO_ICON_MAP[iconName] || iconName;
}

/** Check whether an account icon name resolves synchronously from curated imports. */
export function hasCuratedAccountIcon(iconName?: string | null): boolean {
  if (!iconName) return true;
  const mapped = resolveAccountIconName(iconName);
  return Boolean(ACCOUNT_ICON_MAP[normalizeMaterialIconKey(mapped)]);
}

/** Resolve an emoji or curated icon identifier to a bundled MUI account icon component. */
export const getAccountIconComponent = (
  iconName?: string | null,
): ComponentType<SvgIconProps> => {
  if (!iconName) return PersonIcon;
  const mapped = resolveAccountIconName(iconName);
  const key = normalizeMaterialIconKey(mapped);
  return ACCOUNT_ICON_MAP[key] || PersonIcon;
};
