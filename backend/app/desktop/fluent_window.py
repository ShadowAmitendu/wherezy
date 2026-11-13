"""WinUI 3 Fluent Design Window for Wherezy Desktop Controller.

Built on PyQt6-Fluent-Widgets (qfluentwidgets), delivering native Windows 11
Mica backdrop, acrylic navigation rail, elevated card widgets, and Fluent typography.
"""

from __future__ import annotations

from typing import Callable
from PyQt6 import QtCore, QtGui, QtWidgets
from qfluentwidgets import (
    FluentWindow,
    NavigationItemPosition,
    FluentIcon,
    TitleLabel,
    CaptionLabel,
    StrongBodyLabel,
    BodyLabel,
    PrimaryPushButton,
    PushButton,
    ToolButton,
    CardWidget,
    ProgressBar,
    LineEdit,
    PlainTextEdit,
    ScrollArea,
    SettingCardGroup,
    SettingCard,
    SwitchSettingCard,
    setTheme,
    Theme,
    isDarkTheme,
)


class DashboardInterface(QtWidgets.QWidget):
    """Server control & live overview interface."""

    def __init__(self, parent: QtWidgets.QWidget | None = None) -> None:
        super().__init__(parent=parent)
        self.setObjectName("dashboard_interface")
        self._init_ui()

    def _init_ui(self) -> None:
        main_layout = QtWidgets.QVBoxLayout(self)
        main_layout.setContentsMargins(36, 24, 36, 24)
        main_layout.setSpacing(14)

        # Header Title
        title_box = QtWidgets.QVBoxLayout()
        title_box.setSpacing(4)
        self.lbl_title = TitleLabel("Wherezy Server")
        self.lbl_subtitle = CaptionLabel(
            "LAN-only Household Inventory server process and quick controls"
        )
        title_box.addWidget(self.lbl_title)
        title_box.addWidget(self.lbl_subtitle)
        main_layout.addLayout(title_box)

        # Status & Quick Access Card
        self.status_card = CardWidget(self)
        status_layout = QtWidgets.QVBoxLayout(self.status_card)
        status_layout.setContentsMargins(20, 16, 20, 16)
        status_layout.setSpacing(12)

        # Row 1: State Pill & Server URL
        top_row = QtWidgets.QHBoxLayout()
        top_row.setSpacing(14)

        self.status_icon = ToolButton(FluentIcon.ACCEPT, self.status_card)
        self.status_icon.setDisabled(True)

        url_box = QtWidgets.QVBoxLayout()
        url_box.setSpacing(2)
        state_label_box = QtWidgets.QHBoxLayout()
        state_label_box.setSpacing(8)
        state_title = CaptionLabel("RUNNING STATE:")
        self.status_pill = StrongBodyLabel("Stopped")
        self.status_pill.setStyleSheet("color: #00b4d8; font-weight: bold;")
        state_label_box.addWidget(state_title)
        state_label_box.addWidget(self.status_pill)
        state_label_box.addStretch()

        self.lbl_server_status = BodyLabel("Server not started")
        self.lbl_server_status.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)

        url_box.addLayout(state_label_box)
        url_box.addWidget(self.lbl_server_status)

        top_row.addWidget(self.status_icon)
        top_row.addLayout(url_box, stretch=1)

        self.btn_open_browser = PrimaryPushButton(
            FluentIcon.GLOBE, "Open Web UI", self.status_card
        )
        self.btn_copy_lan = PushButton(FluentIcon.COPY, "Copy URL", self.status_card)
        self.btn_open_data = PushButton(FluentIcon.FOLDER, "Open Data Folder", self.status_card)

        top_row.addWidget(self.btn_open_browser)
        top_row.addWidget(self.btn_copy_lan)
        top_row.addWidget(self.btn_open_data)
        status_layout.addLayout(top_row)

        # Embedded Progress Bar
        self.progress_bar = ProgressBar(self.status_card)
        self.progress_bar.setValue(0)
        self.progress_bar.setFixedHeight(4)
        status_layout.addWidget(self.progress_bar)

        main_layout.addWidget(self.status_card)

        # Server Lifecycle Actions Card
        lifecycle_card = CardWidget(self)
        lifecycle_layout = QtWidgets.QHBoxLayout(lifecycle_card)
        lifecycle_layout.setContentsMargins(20, 14, 20, 14)
        lifecycle_layout.setSpacing(12)

        server_label = StrongBodyLabel("Server Lifecycle:")
        self.btn_start = PrimaryPushButton(FluentIcon.PLAY, "Start Server", lifecycle_card)
        self.btn_stop = PushButton(FluentIcon.CANCEL, "Stop Server", lifecycle_card)
        self.btn_restart = PushButton(FluentIcon.SYNC, "Restart Server", lifecycle_card)

        lifecycle_layout.addWidget(server_label)
        lifecycle_layout.addWidget(self.btn_start)
        lifecycle_layout.addWidget(self.btn_stop)
        lifecycle_layout.addWidget(self.btn_restart)
        lifecycle_layout.addStretch()

        self.btn_hide_tray = PushButton(FluentIcon.MINIMIZE, "Hide to Tray", lifecycle_card)
        self.btn_quit = PushButton(FluentIcon.POWER_BUTTON, "Quit Wherezy", lifecycle_card)
        lifecycle_layout.addWidget(self.btn_hide_tray)
        lifecycle_layout.addWidget(self.btn_quit)

        main_layout.addWidget(lifecycle_card)

        # Live Console Output Card
        console_card = CardWidget(self)
        console_layout = QtWidgets.QVBoxLayout(console_card)
        console_layout.setContentsMargins(18, 14, 18, 14)
        console_layout.setSpacing(10)

        console_header = QtWidgets.QHBoxLayout()
        console_title = StrongBodyLabel("Terminal Output")
        console_header.addWidget(console_title)
        console_header.addStretch()

        self.btn_copy_logs = PushButton(FluentIcon.COPY, "Copy", console_card)
        self.btn_clear_logs = PushButton(FluentIcon.DELETE, "Clear", console_card)
        console_header.addWidget(self.btn_copy_logs)
        console_header.addWidget(self.btn_clear_logs)
        console_layout.addLayout(console_header)

        self.log_text = PlainTextEdit(console_card)
        self.log_text.setReadOnly(True)
        self.log_text.setFont(QtGui.QFont("Cascadia Code", 9))
        self.log_text.setMinimumHeight(160)
        console_layout.addWidget(self.log_text)

        main_layout.addWidget(console_card, stretch=1)


class SettingsInterface(QtWidgets.QWidget):
    """Modern WinUI 3 Settings interface."""

    def __init__(self, parent: QtWidgets.QWidget | None = None) -> None:
        super().__init__(parent=parent)
        self.setObjectName("settings_interface")
        self._init_ui()

    def _init_ui(self) -> None:
        main_layout = QtWidgets.QVBoxLayout(self)
        main_layout.setContentsMargins(36, 24, 36, 24)
        main_layout.setSpacing(16)

        title_box = QtWidgets.QVBoxLayout()
        title_box.setSpacing(4)
        title = TitleLabel("Settings")
        subtitle = CaptionLabel("Desktop controller preferences and network configuration")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        main_layout.addLayout(title_box)

        # Scroll Area for clean scrolling on smaller screens
        self.scroll_area = ScrollArea(self)
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet(
            "QScrollArea { border: none; background: transparent; }"
            "QWidget#scroll_widget { background: transparent; }"
        )

        scroll_widget = QtWidgets.QWidget()
        scroll_widget.setObjectName("scroll_widget")
        scroll_layout = QtWidgets.QVBoxLayout(scroll_widget)
        scroll_layout.setContentsMargins(0, 0, 0, 0)
        scroll_layout.setSpacing(18)

        # Group 1: Appearance
        appearance_group = SettingCardGroup("Appearance", scroll_widget)
        self.theme_card = SwitchSettingCard(
            FluentIcon.BRUSH,
            "Dark Theme Mode",
            "Toggle between Windows 11 Fluent Light and Dark mode",
            parent=appearance_group,
        )
        self.theme_card.setChecked(isDarkTheme())
        self.theme_card.checkedChanged.connect(self._on_theme_changed)
        appearance_group.addSettingCard(self.theme_card)
        scroll_layout.addWidget(appearance_group)

        # Group 2: Startup & Background Behavior
        behavior_group = SettingCardGroup("Startup & Background", scroll_widget)

        self.chk_open_browser = SwitchSettingCard(
            FluentIcon.GLOBE,
            "Open Browser Automatically",
            "Launch web browser when server starts",
            parent=behavior_group,
        )
        self.chk_open_browser.toggled = self.chk_open_browser.checkedChanged

        self.chk_autostart_server = SwitchSettingCard(
            FluentIcon.PLAY,
            "Start Server on Startup",
            "Launch background server process when Wherezy starts",
            parent=behavior_group,
        )
        self.chk_autostart_server.toggled = self.chk_autostart_server.checkedChanged

        self.chk_autostart = SwitchSettingCard(
            FluentIcon.APPLICATION,
            "Start App on Startup",
            "Run Wherezy application automatically on Windows login",
            parent=behavior_group,
        )
        self.chk_autostart.toggled = self.chk_autostart.checkedChanged

        self.chk_close_to_tray = SwitchSettingCard(
            FluentIcon.MINIMIZE,
            "Exit to Tray",
            "Minimize to system tray when closing the window",
            parent=behavior_group,
        )
        self.chk_close_to_tray.toggled = self.chk_close_to_tray.checkedChanged

        self.chk_use_https = SwitchSettingCard(
            FluentIcon.CERTIFICATE,
            "Enable HTTPS",
            "Use self-signed TLS certificates for encrypted LAN access",
            parent=behavior_group,
        )
        self.chk_use_https.toggled = self.chk_use_https.checkedChanged

        behavior_group.addSettingCard(self.chk_open_browser)
        behavior_group.addSettingCard(self.chk_autostart_server)
        behavior_group.addSettingCard(self.chk_autostart)
        behavior_group.addSettingCard(self.chk_close_to_tray)
        behavior_group.addSettingCard(self.chk_use_https)
        scroll_layout.addWidget(behavior_group)

        # Group 3: Storage & Network Configuration
        network_group = SettingCardGroup("Network & Storage", scroll_widget)

        # Data Folder Setting Card
        data_card = SettingCard(
            FluentIcon.FOLDER,
            "Data Folder",
            "Local folder where inventory database and uploaded media are stored",
            parent=network_group,
        )
        self.edit_data_dir = LineEdit(data_card)
        self.edit_data_dir.setMinimumWidth(240)
        self.btn_browse_data = PushButton(FluentIcon.FOLDER, "Browse", data_card)
        data_card.hBoxLayout.addWidget(self.edit_data_dir)
        data_card.hBoxLayout.addWidget(self.btn_browse_data)
        network_group.addSettingCard(data_card)

        # Port Setting Card
        port_card = SettingCard(
            FluentIcon.SYNC,
            "Server Port",
            "Local network port bound by the FastAPI and Uvicorn server",
            parent=network_group,
        )
        self.edit_port = LineEdit(port_card)
        self.edit_port.setFixedWidth(100)
        self.btn_save_apply = PrimaryPushButton(FluentIcon.SAVE, "Save Port", port_card)
        port_card.hBoxLayout.addWidget(self.edit_port)
        port_card.hBoxLayout.addWidget(self.btn_save_apply)
        network_group.addSettingCard(port_card)

        scroll_layout.addWidget(network_group)

        # Actions Row
        actions_row = QtWidgets.QHBoxLayout()
        self.btn_reset_settings = PushButton(
            FluentIcon.HISTORY, "Reset Settings to Default", scroll_widget
        )
        self.btn_save_settings = PrimaryPushButton(
            FluentIcon.SAVE, "Save Settings", scroll_widget
        )
        actions_row.addWidget(self.btn_reset_settings)
        actions_row.addStretch()
        actions_row.addWidget(self.btn_save_settings)
        scroll_layout.addLayout(actions_row)

        self.scroll_area.setWidget(scroll_widget)
        main_layout.addWidget(self.scroll_area)

    def _on_theme_changed(self, is_checked: bool) -> None:
        setTheme(Theme.DARK if is_checked else Theme.LIGHT)


class WherezyFluentMainWindow(FluentWindow):
    """The real WinUI 3 Fluent Window for Wherezy Desktop."""

    def __init__(self, on_close_intercept: Callable[[], bool]) -> None:
        super().__init__()
        self._on_close_intercept = on_close_intercept
        self.setWindowTitle("Wherezy Desktop Controller")
        self.resize(780, 620)

        self.dashboard_interface = DashboardInterface(self)
        self.settings_interface = SettingsInterface(self)

        self.addSubInterface(self.dashboard_interface, FluentIcon.HOME, "Dashboard")
        self.addSubInterface(
            self.settings_interface,
            FluentIcon.SETTING,
            "Settings",
            position=NavigationItemPosition.BOTTOM,
        )

        # Forward child attributes for compatibility with legacy test fixtures and app logic
        self.label_5 = self.dashboard_interface.status_pill
        self.label_6 = self.dashboard_interface.lbl_server_status
        self.pushButton = self.dashboard_interface.btn_start
        self.pushButton_2 = self.dashboard_interface.btn_stop
        self.pushButton_3 = self.dashboard_interface.btn_restart
        self.pushButton_4 = self.dashboard_interface.btn_open_browser
        self.pushButton_5 = self.dashboard_interface.btn_copy_lan
        self.pushButton_6 = self.dashboard_interface.btn_open_data
        self.pushButton_7 = self.dashboard_interface.btn_clear_logs
        self.pushButton_copy = self.dashboard_interface.btn_copy_logs
        self.pushButton_8 = self.settings_interface.btn_save_settings
        self.pushButton_9 = self.settings_interface.btn_browse_data
        self.pushButton_10 = self.settings_interface.btn_save_apply
        self.pushButton_11 = self.dashboard_interface.btn_hide_tray
        self.pushButton_12 = self.dashboard_interface.btn_quit
        self.pushButton_13 = self.settings_interface.btn_reset_settings
        self.checkBox = self.settings_interface.chk_autostart
        self.checkBox_2 = self.settings_interface.chk_open_browser
        self.checkBox_3 = self.settings_interface.chk_close_to_tray
        self.checkBox_4 = self.settings_interface.chk_autostart_server
        self.checkBox_5 = self.settings_interface.chk_use_https
        self.lineEdit = self.settings_interface.edit_data_dir
        self.lineEdit_2 = self.settings_interface.edit_port
        self.plainTextEdit = self.dashboard_interface.log_text
        self.progressBar = self.dashboard_interface.progress_bar

    def closeEvent(self, event: QtGui.QCloseEvent) -> None:
        if self._on_close_intercept():
            event.ignore()
            return
        event.accept()
