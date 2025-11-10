# Makefile for Lighty Uppy GNOME Extension

UUID = lighty-uppy@andypiper.org
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: install uninstall compile-schemas clean

install: compile-schemas
	@echo "Installing extension..."
	@mkdir -p $(INSTALL_DIR)
	@cp -r extension.js keylight.js prefs.js metadata.json stylesheet.css schemas $(INSTALL_DIR)/
	@echo "Extension installed to $(INSTALL_DIR)"
	@echo "Now restart GNOME Shell (Alt+F2, type 'r', press Enter on X11 or logout/login on Wayland)"
	@echo "Then run: gnome-extensions enable $(UUID)"

compile-schemas:
	@echo "Compiling schemas..."
	@glib-compile-schemas schemas/

uninstall:
	@echo "Uninstalling extension..."
	@rm -rf $(INSTALL_DIR)
	@echo "Extension uninstalled"

clean:
	@echo "Cleaning compiled schemas..."
	@rm -f schemas/gschemas.compiled
