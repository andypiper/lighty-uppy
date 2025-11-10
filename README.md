# Lighty Uppy

A simple GNOME Shell extension for controlling Elgato Key Light devices directly from your desktop.

## Features

- 🔆 Control brightness (0-100%)
- 🌡️ Adjust color temperature (2900K-7000K)
- 💡 Toggle lights on/off
- 🔍 Identify lights (flash to locate)
- 📱 Support for multiple Key Light devices
- 🎯 Clean, minimal interface

## Requirements

- GNOME Shell 46 or later
- Elgato Key Light, Key Light Air, or Key Light Mini on your local network

## Installation

### Manual Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/andypiper/lighty-uppy.git
   cd lighty-uppy
   ```

2. Install using Just (recommended):
   ```bash
   just install
   ```

   Or manually:
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/lighty-uppy@andypiper.org
   cp -r extension.js keylight.js prefs.js metadata.json stylesheet.css schemas \
       ~/.local/share/gnome-shell/extensions/lighty-uppy@andypiper.org/
   glib-compile-schemas ~/.local/share/gnome-shell/extensions/lighty-uppy@andypiper.org/schemas/
   ```

3. Restart GNOME Shell:
   - On X11: Press `Alt+F2`, type `r`, and press Enter
   - On Wayland: Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable lighty-uppy@andypiper.org
   # Or use: just enable
   ```

## Configuration

### Finding Your Key Light IP Address

You can find your Key Light's IP address using mDNS/Avahi:

```bash
avahi-browse -atrp | grep _elg._tcp
```

Or check your router's DHCP client list for devices named "Elgato Key Light".

### Adding Lights

#### Automatic Discovery (Recommended)

1. Click the light bulb icon in the top panel
2. Click "Settings"
3. Click "Discover Lights"
4. The extension will automatically find all Key Lights on your network

**Note**: Automatic discovery requires `avahi-utils` to be installed:
```bash
# On Debian/Ubuntu
sudo apt install avahi-utils

# On Fedora
sudo dnf install avahi-tools

# On Arch
sudo pacman -S avahi
```

#### Manual Configuration

If automatic discovery doesn't work or you prefer manual configuration:

1. Click the light bulb icon in the top panel
2. Click "Settings"
3. Click "Add Manually"
4. Enter the IP address of your Key Light
5. Click "Add"

The extension will automatically connect to your lights and display their current state.

## Usage

1. Click the light bulb icon in the GNOME Shell top panel
2. For each configured light:
   - Use the **Power** switch to turn the light on/off
   - Drag the **Brightness** slider to adjust brightness (0-100%)
   - Drag the **Temperature** slider to adjust warmth (warm orange to cool blue)
   - Click **Identify (Flash)** to make the light flash (helpful for identifying which light is which)

The extension automatically refreshes light states every 5 seconds.

## API Details

The extension communicates with Elgato Key Light devices using their HTTP REST API:

- **Port**: 9123
- **Base URL**: `http://<ip>:9123/elgato`
- **Endpoints**:
  - GET `/elgato/lights` - Get current light state
  - PUT `/elgato/lights` - Update light state
  - POST `/elgato/identify` - Flash the light
  - GET `/elgato/accessory-info` - Get device information

Temperature is specified in mireds (143-344), which corresponds to:
- 143 mireds = 7000K (cool, blue light)
- 344 mireds = 2900K (warm, orange light)

## Troubleshooting

### Extension not appearing

Make sure you've restarted GNOME Shell and enabled the extension:

```bash
gnome-extensions enable lighty-uppy@andypiper.org
```

Check for errors:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

### Lights not responding

1. Verify your Key Light is on the same network
2. Test connectivity with curl:
   ```bash
   curl http://<your-light-ip>:9123/elgato/lights
   ```
3. Make sure your firewall allows outgoing connections to port 9123

### Automatic discovery not working

**Check if avahi-utils is installed:**
```bash
which avahi-browse
```

If not found, install the package for your distribution (see Adding Lights section).

**Verify lights are discoverable:**
```bash
avahi-browse -ptr _elg._tcp
```

This should show your Key Light devices. If nothing appears, check that your lights are on the same network and powered on.

## Development

The extension consists of:

- `extension.js` - Main extension with UI
- `keylight.js` - Key Light API client
- `discovery.js` - Avahi mDNS discovery for automatic light detection
- `prefs.js` - Preferences window
- `metadata.json` - Extension metadata
- `schemas/` - GSettings schema for configuration
- `stylesheet.css` - UI styling
- `Justfile` - Build and installation commands

### Available Just Commands

```bash
just --list              # Show all available commands
just install             # Install extension locally
just test                # Test in nested GNOME Shell
just install-and-test    # Install and test
just pack                # Package for distribution
just enable              # Enable extension
just disable             # Disable extension
just uninstall           # Remove extension
just logs                # Watch extension logs
just clean               # Remove build artifacts
```

### Making a Release

```bash
just update-version 3           # Update to version 3
just full-release 3 "New features"  # Build and create GitHub release
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

GPL-3.0-or-later

## Credits

- Based on research from various Key Light API documentation projects
- Inspired by other GNOME Shell extensions for smart home devices

## Links

- [Elgato Key Light](https://www.elgato.com/en/key-light)
- [GNOME Shell Extensions](https://extensions.gnome.org/)
