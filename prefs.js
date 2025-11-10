// SPDX-License-Identifier: GPL-3.0-or-later
// Preferences for Lighty Uppy

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {discoverKeyLights, isAvahiAvailable} from './discovery.js';
import {KeyLight} from './keylight.js';

export default class LightyUppyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Create a preferences page
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        // Create a group for light configuration
        const group = new Adw.PreferencesGroup({
            title: 'Key Light Devices',
            description: 'Add IP addresses of your Elgato Key Light devices',
        });
        page.add(group);

        // Get current IPs
        const ips = settings.get_strv('light-ips');

        // Create a list box for IPs
        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });

        // Add existing IPs
        ips.forEach(ip => {
            const row = this._createIpRow(ip, ip, settings, listBox);
            listBox.append(row);
        });

        group.add(listBox);

        // Discover button
        const discoverButton = new Gtk.Button({
            label: 'Discover Lights',
            halign: Gtk.Align.CENTER,
            margin_top: 12,
            css_classes: ['suggested-action'],
        });

        let discoveryInProgress = false;

        discoverButton.connect('clicked', async () => {
            // Prevent concurrent discoveries
            if (discoveryInProgress) {
                return;
            }

            discoveryInProgress = true;
            discoverButton.sensitive = false;
            discoverButton.label = 'Discovering...';

            try {
                const lights = await discoverKeyLights();

                if (lights.length === 0) {
                    const noLightsDialog = new Gtk.MessageDialog({
                        transient_for: window,
                        modal: true,
                        message_type: Gtk.MessageType.INFO,
                        buttons: Gtk.ButtonsType.OK,
                        text: 'No Lights Found',
                        secondary_text: isAvahiAvailable()
                            ? 'No Elgato Key Lights were discovered on your network. Make sure your lights are powered on and connected to the same network.'
                            : 'avahi-browse is not installed. Install avahi-utils package to enable automatic discovery, or add lights manually.',
                    });
                    noLightsDialog.present();
                    noLightsDialog.connect('response', () => noLightsDialog.destroy());
                } else {
                    // Add discovered lights
                    const currentIps = settings.get_strv('light-ips');
                    let addedCount = 0;

                    for (const light of lights) {
                        if (!currentIps.includes(light.address)) {
                            currentIps.push(light.address);
                            const displayName = light.name || light.address;
                            const row = this._createIpRow(light.address, displayName, settings, listBox);
                            listBox.append(row);
                            addedCount++;
                        }
                    }

                    if (addedCount > 0) {
                        settings.set_strv('light-ips', currentIps);
                    }

                    const resultDialog = new Gtk.MessageDialog({
                        transient_for: window,
                        modal: true,
                        message_type: Gtk.MessageType.INFO,
                        buttons: Gtk.ButtonsType.OK,
                        text: 'Discovery Complete',
                        secondary_text: `Found ${lights.length} light(s), added ${addedCount} new light(s).`,
                    });
                    resultDialog.present();
                    resultDialog.connect('response', () => resultDialog.destroy());
                }
            } catch (e) {
                console.error('Discovery error:', e);
            } finally {
                discoveryInProgress = false;
                discoverButton.sensitive = true;
                discoverButton.label = 'Discover Lights';
            }
        });

        group.add(discoverButton);

        // Add button (manual)
        const addButton = new Gtk.Button({
            label: 'Add Manually',
            halign: Gtk.Align.CENTER,
            margin_top: 6,
        });

        addButton.connect('clicked', async () => {
            const dialog = new Gtk.Dialog({
                title: 'Add Key Light',
                transient_for: window,
                modal: true,
            });

            const cancelButton = dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
            const addButton = dialog.add_button('Add', Gtk.ResponseType.OK);

            const contentArea = dialog.get_content_area();
            contentArea.spacing = 12;
            contentArea.margin_top = 12;
            contentArea.margin_bottom = 12;
            contentArea.margin_start = 12;
            contentArea.margin_end = 12;

            const entry = new Gtk.Entry({
                placeholder_text: 'e.g. 192.168.1.100 or elgato-key-light.local',
                hexpand: true,
            });

            const statusLabel = new Gtk.Label({
                label: '',
                xalign: 0,
                css_classes: ['dim-label'],
            });

            contentArea.append(new Gtk.Label({
                label: 'Enter the IP address or hostname of your Key Light:',
                xalign: 0,
            }));
            contentArea.append(entry);
            contentArea.append(statusLabel);

            let validationInProgress = false;

            dialog.connect('response', async (dialog, response) => {
                if (response === Gtk.ResponseType.OK && !validationInProgress) {
                    const newAddress = entry.get_text().trim();
                    if (!newAddress) {
                        dialog.destroy();
                        return;
                    }

                    // Check if already added
                    const currentIps = settings.get_strv('light-ips');
                    if (currentIps.includes(newAddress)) {
                        const errorDialog = new Gtk.MessageDialog({
                            transient_for: window,
                            modal: true,
                            message_type: Gtk.MessageType.WARNING,
                            buttons: Gtk.ButtonsType.OK,
                            text: 'Already Added',
                            secondary_text: `${newAddress} is already in your list of lights.`,
                        });
                        errorDialog.present();
                        errorDialog.connect('response', () => errorDialog.destroy());
                        dialog.destroy();
                        return;
                    }

                    // Prevent multiple clicks
                    validationInProgress = true;
                    addButton.sensitive = false;
                    cancelButton.sensitive = false;
                    entry.sensitive = false;
                    statusLabel.label = 'Validating connection...';

                    try {
                        // Test the connection
                        const testLight = new KeyLight(newAddress, newAddress);
                        const info = await testLight.getAccessoryInfo();

                        if (info) {
                            // Success! Add the light
                            currentIps.push(newAddress);
                            settings.set_strv('light-ips', currentIps);

                            // Add to list with product name if available
                            const displayName = info.displayName || info.productName || newAddress;
                            const row = this._createIpRow(newAddress, displayName, settings, listBox);
                            listBox.append(row);

                            // Show success message
                            statusLabel.label = `✓ Connected to ${displayName}`;

                            // Close after short delay
                            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                                dialog.destroy();
                                return GLib.SOURCE_REMOVE;
                            });
                        } else {
                            // Failed to connect
                            statusLabel.label = '✗ Could not connect to light';
                            addButton.sensitive = true;
                            cancelButton.sensitive = true;
                            entry.sensitive = true;
                            validationInProgress = false;

                            const errorDialog = new Gtk.MessageDialog({
                                transient_for: window,
                                modal: true,
                                message_type: Gtk.MessageType.ERROR,
                                buttons: Gtk.ButtonsType.OK,
                                text: 'Connection Failed',
                                secondary_text: `Could not connect to ${newAddress}. Please check:\n\n• The address is correct\n• The light is powered on\n• The light is on the same network\n• Port 9123 is accessible`,
                            });
                            errorDialog.present();
                            errorDialog.connect('response', () => errorDialog.destroy());
                        }
                    } catch (e) {
                        console.error('Validation error:', e);
                        statusLabel.label = '✗ Validation failed';
                        addButton.sensitive = true;
                        cancelButton.sensitive = true;
                        entry.sensitive = true;
                        validationInProgress = false;

                        const errorDialog = new Gtk.MessageDialog({
                            transient_for: window,
                            modal: true,
                            message_type: Gtk.MessageType.ERROR,
                            buttons: Gtk.ButtonsType.OK,
                            text: 'Validation Error',
                            secondary_text: `Error testing connection: ${e.message}`,
                        });
                        errorDialog.present();
                        errorDialog.connect('response', () => errorDialog.destroy());
                    }
                } else {
                    dialog.destroy();
                }
            });

            dialog.present();
        });

        group.add(addButton);
    }

    _createIpRow(ip, displayName, settings, listBox) {
        const row = new Adw.ActionRow({
            title: displayName,
            subtitle: displayName !== ip ? ip : null,
        });

        // Info button
        const infoButton = new Gtk.Button({
            icon_name: 'dialog-information-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: 'Show device information',
        });

        infoButton.connect('clicked', () => {
            this._showDeviceInfo(ip, displayName, row.get_root());
        });

        // Remove button
        const removeButton = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: 'Remove device',
        });

        removeButton.connect('clicked', () => {
            const currentIps = settings.get_strv('light-ips');
            const index = currentIps.indexOf(ip);
            if (index > -1) {
                currentIps.splice(index, 1);
                settings.set_strv('light-ips', currentIps);
                listBox.remove(row);
            }
        });

        row.add_suffix(infoButton);
        row.add_suffix(removeButton);

        return row;
    }

    async _showDeviceInfo(ip, displayName, parentWindow) {
        const light = new KeyLight(ip, displayName);

        // Create dialog
        const dialog = new Adw.Window({
            title: 'Device Information',
            modal: true,
            transient_for: parentWindow,
            default_width: 400,
            default_height: 500,
        });

        const toolbarView = new Adw.ToolbarView();
        dialog.set_content(toolbarView);

        // Header bar
        const headerBar = new Adw.HeaderBar();
        toolbarView.add_top_bar(headerBar);

        // Content
        const scrolledWindow = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });
        toolbarView.set_content(scrolledWindow);

        const clamp = new Adw.Clamp({
            maximum_size: 600,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 12,
            margin_end: 12,
        });
        scrolledWindow.set_child(clamp);

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
        });
        clamp.set_child(contentBox);

        // Loading status
        const spinner = new Gtk.Spinner({
            spinning: true,
            halign: Gtk.Align.CENTER,
            margin_top: 48,
            margin_bottom: 48,
        });
        contentBox.append(spinner);

        const statusLabel = new Gtk.Label({
            label: 'Loading device information...',
            halign: Gtk.Align.CENTER,
        });
        contentBox.append(statusLabel);

        dialog.present();

        // Fetch device info
        try {
            const info = await light.getAccessoryInfo();
            const state = await light.getLights();

            // Clear loading UI
            contentBox.remove(spinner);
            contentBox.remove(statusLabel);

            if (!info) {
                const errorLabel = new Gtk.Label({
                    label: 'Failed to retrieve device information.\nPlease check the connection.',
                    halign: Gtk.Align.CENTER,
                    justify: Gtk.Justification.CENTER,
                    margin_top: 48,
                    margin_bottom: 48,
                });
                contentBox.append(errorLabel);
                return;
            }

            // Create info groups
            const deviceGroup = new Adw.PreferencesGroup({
                title: 'Device',
            });
            contentBox.append(deviceGroup);

            if (info.displayName) {
                const nameRow = new Adw.ActionRow({
                    title: 'Display Name',
                    subtitle: info.displayName,
                });
                deviceGroup.add(nameRow);
            }

            if (info.productName) {
                const productRow = new Adw.ActionRow({
                    title: 'Product',
                    subtitle: info.productName,
                });
                deviceGroup.add(productRow);
            }

            const ipRow = new Adw.ActionRow({
                title: 'IP Address',
                subtitle: ip,
            });
            deviceGroup.add(ipRow);

            // Firmware group
            const firmwareGroup = new Adw.PreferencesGroup({
                title: 'Firmware',
            });
            contentBox.append(firmwareGroup);

            if (info.firmwareVersion) {
                const fwVersionRow = new Adw.ActionRow({
                    title: 'Version',
                    subtitle: info.firmwareVersion.toString(),
                });
                firmwareGroup.add(fwVersionRow);
            }

            if (info.firmwareBuildNumber) {
                const fwBuildRow = new Adw.ActionRow({
                    title: 'Build Number',
                    subtitle: info.firmwareBuildNumber.toString(),
                });
                firmwareGroup.add(fwBuildRow);
            }

            // Hardware group
            const hardwareGroup = new Adw.PreferencesGroup({
                title: 'Hardware',
            });
            contentBox.append(hardwareGroup);

            if (info.serialNumber) {
                const serialRow = new Adw.ActionRow({
                    title: 'Serial Number',
                    subtitle: info.serialNumber,
                });
                hardwareGroup.add(serialRow);
            }

            if (info.hardwareBoardType) {
                const boardRow = new Adw.ActionRow({
                    title: 'Board Type',
                    subtitle: info.hardwareBoardType.toString(),
                });
                hardwareGroup.add(boardRow);
            }

            // Current state group
            if (state) {
                const stateGroup = new Adw.PreferencesGroup({
                    title: 'Current State',
                });
                contentBox.append(stateGroup);

                const powerRow = new Adw.ActionRow({
                    title: 'Power',
                    subtitle: state.on === 1 ? 'On' : 'Off',
                });
                stateGroup.add(powerRow);

                const brightnessRow = new Adw.ActionRow({
                    title: 'Brightness',
                    subtitle: `${state.brightness}%`,
                });
                stateGroup.add(brightnessRow);

                // Convert mireds to Kelvin
                const kelvin = Math.round(1000000 / state.temperature);
                const tempRow = new Adw.ActionRow({
                    title: 'Color Temperature',
                    subtitle: `${kelvin}K (${state.temperature} mireds)`,
                });
                stateGroup.add(tempRow);
            }
        } catch (e) {
            console.error('Error fetching device info:', e);
            contentBox.remove(spinner);
            contentBox.remove(statusLabel);

            const errorLabel = new Gtk.Label({
                label: `Error: ${e.message}`,
                halign: Gtk.Align.CENTER,
                margin_top: 48,
                margin_bottom: 48,
            });
            contentBox.append(errorLabel);
        }
    }
}
