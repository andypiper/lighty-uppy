# Justfile for Lighty Uppy GNOME Shell Extension

UUID := "lighty-uppy@andypiper.org"

# List available commands
default:
    @just --list

# Compile GSettings schemas
compile-schemas:
    @echo "Compiling schemas..."
    @glib-compile-schemas schemas/

# Pack extension for distribution
pack: compile-schemas
    @echo "Packing extension..."
    @gnome-extensions pack --force \
        --extra-source=keylight.js \
        --extra-source=discovery.js \
        --extra-source=schemas

# Install extension locally
install: compile-schemas
    @echo "Installing extension..."
    @mkdir -p ~/.local/share/gnome-shell/extensions/{{UUID}}
    @cp -r extension.js keylight.js discovery.js prefs.js metadata.json stylesheet.css schemas \
        ~/.local/share/gnome-shell/extensions/{{UUID}}/
    @echo "Extension installed to ~/.local/share/gnome-shell/extensions/{{UUID}}"
    @echo "Restart GNOME Shell (Alt+F2, type 'r', Enter on X11 or logout/login on Wayland)"
    @echo "Then enable with: gnome-extensions enable {{UUID}}"

# Update version in metadata.json
update-version VERSION:
    @echo "Updating version to {{VERSION}}..."
    @sed -i 's/"version": [0-9]*/"version": {{VERSION}}/' metadata.json
    @echo "Version updated to {{VERSION}}"

# Create GitHub release
release VERSION: pack
    @echo "Creating GitHub release v{{VERSION}}..."
    @gh release create "v{{VERSION}}" "{{UUID}}.shell-extension.zip" --title "v{{VERSION}}"

# Create GitHub release with notes
release-with-notes VERSION notes: pack
    @echo "Creating GitHub release v{{VERSION}}..."
    @gh release create "v{{VERSION}}" "{{UUID}}.shell-extension.zip" --title "v{{VERSION}}" --notes "{{notes}}"

# Full release: update version, pack, and create GitHub release
full-release VERSION: (update-version VERSION) pack (release VERSION)
    @echo "Release v{{VERSION}} complete!"

# Full release with notes: update version, pack, and create GitHub release with notes
full-release-with-notes VERSION notes: (update-version VERSION) pack (release-with-notes VERSION notes)
    @echo "Release v{{VERSION}} complete!"

# Publish extension to extensions.gnome.org (interactive password)
publish username: pack
    @echo "Publishing {{UUID}}.shell-extension.zip to extensions.gnome.org as {{username}}..."
    @echo "You will be prompted for your password."
    @gnome-extensions upload --user "{{username}}" --accept-tos "{{UUID}}.shell-extension.zip"

# Publish extension to extensions.gnome.org (with password file)
publish-with-password username password_file: pack
    @echo "Publishing {{UUID}}.shell-extension.zip to extensions.gnome.org as {{username}}..."
    @gnome-extensions upload --user "{{username}}" --password-file "{{password_file}}" --accept-tos "{{UUID}}.shell-extension.zip"

# Clean build artifacts
clean:
    @echo "Cleaning build artifacts..."
    @rm -f {{UUID}}.shell-extension.zip
    @rm -f schemas/gschemas.compiled
    @echo "Clean complete"

# Uninstall extension
uninstall:
    @echo "Uninstalling extension..."
    @gnome-extensions disable {{UUID}} || true
    @rm -rf ~/.local/share/gnome-shell/extensions/{{UUID}}
    @echo "Extension uninstalled"

# Enable extension
enable:
    @gnome-extensions enable {{UUID}}
    @echo "Extension enabled"

# Disable extension
disable:
    @gnome-extensions disable {{UUID}}
    @echo "Extension disabled"

# Show extension info
info:
    @gnome-extensions info {{UUID}}

# Show extension logs
logs:
    @journalctl -f -o cat /usr/bin/gnome-shell | grep -i "lighty"
