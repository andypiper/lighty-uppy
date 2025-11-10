// SPDX-License-Identifier: GPL-3.0-or-later
// Preferences for Lighty Uppy

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {discoverKeyLights, isAvahiAvailable} from './discovery.js';

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
            const row = this._createIpRow(ip, settings, listBox);
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

        discoverButton.connect('clicked', async () => {
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
                            const row = this._createIpRow(light.address, settings, listBox);
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

        addButton.connect('clicked', () => {
            const dialog = new Gtk.Dialog({
                title: 'Add Key Light',
                transient_for: window,
                modal: true,
            });

            dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
            dialog.add_button('Add', Gtk.ResponseType.OK);

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

            contentArea.append(new Gtk.Label({
                label: 'Enter the IP address or hostname of your Key Light:',
                xalign: 0,
            }));
            contentArea.append(entry);

            dialog.connect('response', (dialog, response) => {
                if (response === Gtk.ResponseType.OK) {
                    const newIp = entry.get_text().trim();
                    if (newIp) {
                        const currentIps = settings.get_strv('light-ips');
                        if (!currentIps.includes(newIp)) {
                            currentIps.push(newIp);
                            settings.set_strv('light-ips', currentIps);

                            // Add to list
                            const row = this._createIpRow(newIp, settings, listBox);
                            listBox.append(row);
                        }
                    }
                }
                dialog.destroy();
            });

            dialog.present();
        });

        group.add(addButton);
    }

    _createIpRow(ip, settings, listBox) {
        const row = new Adw.ActionRow({
            title: ip,
        });

        // Remove button
        const removeButton = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
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

        row.add_suffix(removeButton);

        return row;
    }
}
