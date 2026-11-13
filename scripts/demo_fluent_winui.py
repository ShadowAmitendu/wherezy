"""Wherezy WinUI 3 Demo using PyQt6-Fluent-Widgets (qfluentwidgets).

This demo showcases modern Windows 11 Fluent Design (WinUI 3) controls in Python:
- Frameless window with native snap layouts, rounded corners, and Mica backdrop
- Fluent Navigation rail (Dashboard, AI Assistant, Settings)
- WinUI 3 styled cards, buttons, badges, tables, search bar, and info bars
- Interactive Light/Dark theme switching
"""

import sys
from pathlib import Path
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QIcon, QFont
from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QTableWidgetItem, QHeaderView, QLabel, QFrame
)
from qfluentwidgets import (
    FluentWindow, NavigationItemPosition, FluentIcon,
    TitleLabel, SubtitleLabel, BodyLabel, CaptionLabel, StrongBodyLabel,
    PrimaryPushButton, PushButton, ToolButton, SwitchButton,
    CardWidget, ElevatedCardWidget, SimpleCardWidget,
    SearchLineEdit, TableWidget, ProgressBar, ProgressRing,
    InfoBar, InfoBarPosition, ComboBox, LineEdit, SpinBox,
    SettingCardGroup, SwitchSettingCard,
    toggleTheme, isDarkTheme, setTheme, Theme
)


class DashboardInterface(QWidget):
    """Main dashboard page."""

    def __init__(self, parent=None):
        super().__init__(parent=parent)
        self.setObjectName("dashboard_interface")
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(36, 24, 36, 24)
        layout.setSpacing(16)

        # Header Title
        title = TitleLabel("Wherezy Inventory Controller")
        subtitle = CaptionLabel("Modern WinUI 3 Fluent Design desktop application running on Python + PyQt6")
        layout.addWidget(title)
        layout.addWidget(subtitle)

        # Server Status Banner Card
        status_card = CardWidget(self)
        status_layout = QHBoxLayout(status_card)
        status_layout.setContentsMargins(20, 16, 20, 16)
        status_layout.setSpacing(14)

        icon_widget = ToolButton(FluentIcon.ACCEPT, status_card)
        icon_widget.setDisabled(True)

        info_box = QVBoxLayout()
        info_title = StrongBodyLabel("FastAPI LAN Server Active")
        info_desc = CaptionLabel("Listening on http://127.0.0.1:8000 (LAN access enabled for mobile devices)")
        info_box.addWidget(info_title)
        info_box.addWidget(info_desc)

        self.server_switch = SwitchButton(status_card)
        self.server_switch.setChecked(True)
        self.server_switch.setOnText("Running")
        self.server_switch.setOffText("Stopped")

        self.open_web_btn = PrimaryPushButton(FluentIcon.GLOBE, "Open Web App", status_card)
        self.notify_btn = PushButton(FluentIcon.RINGER, "Test Notification", status_card)

        status_layout.addWidget(icon_widget)
        status_layout.addLayout(info_box, stretch=1)
        status_layout.addWidget(self.server_switch)
        status_layout.addWidget(self.open_web_btn)
        status_layout.addWidget(self.notify_btn)

        layout.addWidget(status_card)

        # Metrics Row (3 cards)
        metrics_layout = QHBoxLayout()
        metrics_layout.setSpacing(14)

        self._add_metric_card(metrics_layout, FluentIcon.FOLDER, "Total Inventory", "142 Items", "Across 8 storage bins")
        self._add_metric_card(metrics_layout, FluentIcon.TAG, "Low Stock Alerts", "4 Items", "Need replenishment")
        self._add_metric_card(metrics_layout, FluentIcon.ROBOT, "Local AI Status", "Connected", "Ollama: qwen2.5:7b")

        layout.addLayout(metrics_layout)

        # Search Bar + Table
        search_layout = QHBoxLayout()
        search_layout.setSpacing(10)
        self.search_box = SearchLineEdit(self)
        self.search_box.setPlaceholderText("Search items, barcodes, rooms, or categories...")
        self.search_box.setClearButtonEnabled(True)

        self.filter_btn = PushButton(FluentIcon.FILTER, "Filter", self)
        self.add_item_btn = PrimaryPushButton(FluentIcon.ADD, "Add Item", self)

        search_layout.addWidget(self.search_box, stretch=1)
        search_layout.addWidget(self.filter_btn)
        search_layout.addWidget(self.add_item_btn)
        layout.addLayout(search_layout)

        # Sample Inventory Table
        self.table = TableWidget(self)
        self.table.setColumnCount(4)
        self.table.setHorizontalHeaderLabels(["Item Name", "Location", "Category", "Quantity"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)

        sample_items = [
            ("Sony WH-1000XM5 Wireless Headphones", "Office / Desk Drawer", "Electronics", "1"),
            ("Bosch 18V Cordless Drill & Battery", "Garage / Tool Cabinet A", "Tools", "2"),
            ("Anker 65W GaN Fast Charger (USB-C)", "Living Room / Tech Basket", "Accessories", "3"),
            ("Raspberry Pi 5 8GB Starter Kit", "Lab / Shelf 2", "Hardware", "1"),
        ]

        self.table.setRowCount(len(sample_items))
        for row, item in enumerate(sample_items):
            for col, val in enumerate(item):
                self.table.setItem(row, col, QTableWidgetItem(val))

        layout.addWidget(self.table, stretch=1)

        # Connect notification button
        self.notify_btn.clicked.connect(self._show_test_notification)

    def _add_metric_card(self, parent_layout, icon, label, value, subtext):
        card = CardWidget(self)
        card_layout = QHBoxLayout(card)
        card_layout.setContentsMargins(16, 14, 16, 14)
        card_layout.setSpacing(12)

        icon_btn = ToolButton(icon, card)
        icon_btn.setDisabled(True)

        text_layout = QVBoxLayout()
        text_layout.setSpacing(2)
        title_lbl = CaptionLabel(label)
        val_lbl = StrongBodyLabel(value)
        sub_lbl = CaptionLabel(subtext)
        text_layout.addWidget(title_lbl)
        text_layout.addWidget(val_lbl)
        text_layout.addWidget(sub_lbl)

        card_layout.addWidget(icon_btn)
        card_layout.addLayout(text_layout)
        parent_layout.addWidget(card)

    def _show_test_notification(self):
        InfoBar.success(
            title="WinUI 3 Notification",
            content="Native Fluent Design InfoBar triggered from Python!",
            orient=Qt.Orientation.Horizontal,
            isClosable=True,
            position=InfoBarPosition.TOP_RIGHT,
            duration=3000,
            parent=self.window()
        )


class AIAssistantInterface(QWidget):
    """AI Assistant & Vision configuration page."""

    def __init__(self, parent=None):
        super().__init__(parent=parent)
        self.setObjectName("ai_interface")
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(36, 24, 36, 24)
        layout.setSpacing(16)

        title = TitleLabel("Local AI & Vision Assistant")
        subtitle = CaptionLabel("Configure Ollama or OpenAI-compatible vision backends for automated item categorizing")
        layout.addWidget(title)
        layout.addWidget(subtitle)

        card = CardWidget(self)
        form_layout = QVBoxLayout(card)
        form_layout.setContentsMargins(24, 20, 24, 20)
        form_layout.setSpacing(14)

        # Provider
        prov_layout = QHBoxLayout()
        prov_label = BodyLabel("AI Provider:")
        self.provider_combo = ComboBox(card)
        self.provider_combo.addItems(["Ollama (Local LAN)", "OpenAI Compatible", "Google Gemini"])
        prov_layout.addWidget(prov_label)
        prov_layout.addWidget(self.provider_combo, stretch=1)
        form_layout.addLayout(prov_layout)

        # Endpoint
        endpoint_layout = QHBoxLayout()
        endpoint_label = BodyLabel("API Base URL:")
        self.endpoint_input = LineEdit(card)
        self.endpoint_input.setText("http://localhost:11434/api")
        endpoint_layout.addWidget(endpoint_label)
        endpoint_layout.addWidget(self.endpoint_input, stretch=1)
        form_layout.addLayout(endpoint_layout)

        # Model name
        model_layout = QHBoxLayout()
        model_label = BodyLabel("Model Name:")
        self.model_input = LineEdit(card)
        self.model_input.setText("qwen2.5:7b")
        model_layout.addWidget(model_label)
        model_layout.addWidget(self.model_input, stretch=1)
        form_layout.addLayout(model_layout)

        # Actions
        btn_layout = QHBoxLayout()
        self.test_ai_btn = PrimaryPushButton(FluentIcon.ROBOT, "Test AI Connection", card)
        self.save_btn = PushButton(FluentIcon.SAVE, "Save Configuration", card)
        btn_layout.addWidget(self.test_ai_btn)
        btn_layout.addWidget(self.save_btn)
        btn_layout.addStretch()
        form_layout.addLayout(btn_layout)

        layout.addWidget(card)
        layout.addStretch()

        self.test_ai_btn.clicked.connect(self._on_test_ai)

    def _on_test_ai(self):
        InfoBar.info(
            title="Local AI Verification",
            content=f"Connecting to {self.model_input.text()} at {self.endpoint_input.text()}...",
            orient=Qt.Orientation.Horizontal,
            isClosable=True,
            position=InfoBarPosition.TOP_RIGHT,
            duration=3000,
            parent=self.window()
        )


class SettingsInterface(QWidget):
    """Settings page with Theme toggle and controller configuration."""

    def __init__(self, parent=None):
        super().__init__(parent=parent)
        self.setObjectName("settings_interface")
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(36, 24, 36, 24)
        layout.setSpacing(16)

        title = TitleLabel("Settings")
        subtitle = CaptionLabel("Personalization and Wherezy server preferences")
        layout.addWidget(title)
        layout.addWidget(subtitle)

        # Appearance Group
        group = SettingCardGroup("Appearance", self)

        # Dark theme toggle card
        self.theme_card = SwitchSettingCard(
            icon=FluentIcon.BRUSH,
            title="Dark Theme Mode",
            content="Toggle between Windows 11 Fluent Light and Dark mode",
            parent=group
        )
        self.theme_card.setChecked(isDarkTheme())
        self.theme_card.checkedChanged.connect(self._on_theme_changed)
        group.addSettingCard(self.theme_card)

        layout.addWidget(group)

        # Server Preferences Group
        srv_group = SettingCardGroup("Server Network", self)
        self.autostart_card = SwitchSettingCard(
            icon=FluentIcon.SYNC,
            title="Auto-start server on launch",
            content="Automatically launch the FastAPI background process when starting Wherezy",
            parent=srv_group
        )
        self.autostart_card.setChecked(True)
        srv_group.addSettingCard(self.autostart_card)

        layout.addWidget(srv_group)
        layout.addStretch()

    def _on_theme_changed(self, is_checked: bool):
        setTheme(Theme.DARK if is_checked else Theme.LIGHT)


class WherezyWinUIDemo(FluentWindow):
    """The main WinUI 3 Fluent window."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Wherezy — WinUI 3 Python Demo")
        self.resize(880, 640)

        # Create pages
        self.dashboard_interface = DashboardInterface(self)
        self.ai_interface = AIAssistantInterface(self)
        self.settings_interface = SettingsInterface(self)

        # Navigation rail
        self.addSubInterface(self.dashboard_interface, FluentIcon.HOME, "Inventory")
        self.addSubInterface(self.ai_interface, FluentIcon.ROBOT, "AI Assistant")
        self.addSubInterface(
            self.settings_interface,
            FluentIcon.SETTING,
            "Settings",
            position=NavigationItemPosition.BOTTOM
        )


def main():
    app = QApplication(sys.argv)

    # Check for dark flag
    if "--dark" in sys.argv:
        setTheme(Theme.DARK)
    else:
        setTheme(Theme.LIGHT)

    window = WherezyWinUIDemo()

    if "--screenshot" in sys.argv:
        idx = sys.argv.index("--screenshot")
        out_path = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else "winui3_demo.png"
        window.show()
        # Trigger an infobar for visual demonstration
        InfoBar.success(
            title="WinUI 3 Active",
            content="Mica backdrop, Fluent navigation, and Windows 11 components initialized.",
            orient=Qt.Orientation.Horizontal,
            isClosable=True,
            position=InfoBarPosition.TOP_RIGHT,
            duration=5000,
            parent=window
        )
        app.processEvents()

        for _ in range(5):
            app.processEvents()

        pixmap = window.grab()
        pixmap.save(out_path)
        print(f"Screenshot saved to {out_path} ({pixmap.width()}x{pixmap.height()})")
        return

    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
