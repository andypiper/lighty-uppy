// SPDX-License-Identifier: GPL-3.0-or-later
// Lighty Uppy - Elgato Key Light Control for GNOME Shell

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {KeyLight} from './keylight.js';

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(settings, extension) {
        super._init(0.0, 'Lighty Uppy');

        this._settings = settings;
        this._extension = extension;
        this._lights = [];
        this._updateTimeoutId = null;
        this._loadInProgress = false;

        // Panel icon - using weather-clear-symbolic as a light/sun icon
        const icon = new St.Icon({
            icon_name: 'weather-clear-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(icon);

        // Build menu
        this._buildMenu();

        // Load lights from settings
        this._loadLights();

        // Listen for settings changes to reload lights
        this._settingsChangedId = this._settings.connect('changed::light-ips', () => {
            this._loadLights();
        });

        // Update state periodically
        this._scheduleUpdate();
    }

    _buildMenu() {
        this._lightsSections = [];
        this._refreshSignalId = null;
        this._settingsSignalId = null;

        // Add refresh button at top
        const refreshItem = new PopupMenu.PopupMenuItem('Refresh');
        this._refreshSignalId = refreshItem.connect('activate', () => this._updateAllLights());
        this.menu.addMenuItem(refreshItem);
        this._refreshItem = refreshItem;

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Control All Lights section (will be populated after lights load)
        this._controlAllSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._controlAllSection);

        this._controlAllSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(this._controlAllSeparator);
        this._controlAllSeparator.visible = false;

        // Placeholder for no lights
        this._noLightsLabel = new PopupMenu.PopupMenuItem('No lights configured', {
            reactive: false,
        });
        this.menu.addMenuItem(this._noLightsLabel);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Settings button
        const settingsItem = new PopupMenu.PopupMenuItem('Settings');
        this._settingsSignalId = settingsItem.connect('activate', () => {
            this.menu.close();
            this._openPreferences();
        });
        this.menu.addMenuItem(settingsItem);
        this._settingsItem = settingsItem;
    }

    async _loadLights() {
        // Prevent concurrent loads
        if (this._loadInProgress) {
            return;
        }

        this._loadInProgress = true;

        try {
            const ips = this._settings.get_strv('light-ips');

            this._lights = ips.map(ip => new KeyLight(ip, ip));

            // Fetch accessory info for each light to get display names
            for (const light of this._lights) {
                const info = await light.getAccessoryInfo();
                if (info && info.displayName) {
                    light.displayName = info.displayName;
                } else if (info && info.productName) {
                    light.displayName = info.productName;
                } else {
                    light.displayName = light.ipAddress;
                }
                light.accessoryInfo = info;
                light.isOnline = info !== null;
            }

            // Rebuild light controls
            this._rebuildLightControls();

            // Update state
            this._updateAllLights();
        } finally {
            this._loadInProgress = false;
        }
    }

    _rebuildLightControls() {
        // Disconnect signals and remove old sections
        this._lightsSections.forEach(section => {
            // Disconnect all signal handlers to prevent memory leaks
            if (section._powerSwitch && section._powerSignalId) {
                section._powerSwitch.disconnect(section._powerSignalId);
            }
            if (section._brightnessSlider && section._brightnessSignalId) {
                section._brightnessSlider.disconnect(section._brightnessSignalId);
            }
            if (section._tempSlider && section._tempSignalId) {
                section._tempSlider.disconnect(section._tempSignalId);
            }
            if (section._identifyItem && section._identifySignalId) {
                section._identifyItem.disconnect(section._identifySignalId);
            }
            section.destroy();
        });
        this._lightsSections = [];

        // Disconnect control all section signals
        if (this._controlAllSection._allPowerSwitch && this._controlAllSection._allPowerSignalId) {
            this._controlAllSection._allPowerSwitch.disconnect(this._controlAllSection._allPowerSignalId);
        }
        if (this._controlAllSection._allBrightnessSlider && this._controlAllSection._allBrightnessSignalId) {
            this._controlAllSection._allBrightnessSlider.disconnect(this._controlAllSection._allBrightnessSignalId);
        }
        if (this._controlAllSection._allTempSlider && this._controlAllSection._allTempSignalId) {
            this._controlAllSection._allTempSlider.disconnect(this._controlAllSection._allTempSignalId);
        }

        // Clear control all section
        this._controlAllSection.removeAll();

        if (this._lights.length === 0) {
            this._noLightsLabel.visible = true;
            this._controlAllSeparator.visible = false;
            return;
        }

        this._noLightsLabel.visible = false;

        // Add Control All section if multiple lights
        if (this._lights.length > 1) {
            this._buildControlAllSection();
            this._controlAllSeparator.visible = true;
        } else {
            this._controlAllSeparator.visible = false;
        }

        // Create controls for each light
        this._lights.forEach((light, index) => {
            const section = this._createLightSection(light, index);
            this._lightsSections.push(section);

            // Insert before the last separator
            const items = this.menu._getMenuItems();
            const settingsSeparatorIndex = items.length - 2;
            this.menu.addMenuItem(section, settingsSeparatorIndex);

            if (index < this._lights.length - 1) {
                const sep = new PopupMenu.PopupSeparatorMenuItem();
                this._lightsSections.push(sep);
                this.menu.addMenuItem(sep, settingsSeparatorIndex + 1);
            }
        });
    }

    _buildControlAllSection() {
        const titleItem = new PopupMenu.PopupMenuItem('Control All Lights', {
            reactive: false,
            can_focus: false,
        });
        this._controlAllSection.addMenuItem(titleItem);

        // All On/Off switch
        const allPowerItem = new PopupMenu.PopupSwitchMenuItem('All Lights Power', false);
        const allPowerSignalId = allPowerItem.connect('toggled', (item) => {
            this._setAllPower(item.state);
        });
        this._controlAllSection.addMenuItem(allPowerItem);

        // All Brightness slider
        const allBrightnessBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
        });
        const allBrightnessLabel = new St.Label({
            text: 'All Brightness',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const allBrightnessSlider = new Slider.Slider(0.5);
        const allBrightnessSignalId = allBrightnessSlider.connect('notify::value', () => {
            this._setAllBrightness(allBrightnessSlider.value * 100);
        });

        allBrightnessBox.add_child(allBrightnessLabel);
        allBrightnessBox.add_child(allBrightnessSlider);

        const allBrightnessItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
        });
        allBrightnessItem.add_child(allBrightnessBox);
        this._controlAllSection.addMenuItem(allBrightnessItem);

        // All Temperature slider
        const allTempBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
        });
        const allTempLabel = new St.Label({
            text: 'All Temperature',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const allTempSlider = new Slider.Slider(0.5);
        const allTempSignalId = allTempSlider.connect('notify::value', () => {
            const temp = 143 + (allTempSlider.value * (344 - 143));
            this._setAllTemperature(temp);
        });

        allTempBox.add_child(allTempLabel);
        allTempBox.add_child(allTempSlider);

        const allTempItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
        });
        allTempItem.add_child(allTempBox);
        this._controlAllSection.addMenuItem(allTempItem);

        // Store references and signal IDs for cleanup
        this._controlAllSection._allPowerSwitch = allPowerItem;
        this._controlAllSection._allPowerSignalId = allPowerSignalId;
        this._controlAllSection._allBrightnessSlider = allBrightnessSlider;
        this._controlAllSection._allBrightnessSignalId = allBrightnessSignalId;
        this._controlAllSection._allTempSlider = allTempSlider;
        this._controlAllSection._allTempSignalId = allTempSignalId;
    }

    _createLightSection(light, index) {
        const section = new PopupMenu.PopupMenuSection();

        // Light name with display name or IP, and offline indicator
        const displayName = light.displayName || light.ipAddress;
        const fullName = light.isOnline ? displayName : `${displayName} (Offline)`;
        const nameItem = new PopupMenu.PopupMenuItem(fullName, {
            reactive: false,
            can_focus: false,
        });
        section.addMenuItem(nameItem);
        section._nameItem = nameItem;

        // Details submenu if accessory info is available
        if (light.accessoryInfo) {
            const detailsItem = new PopupMenu.PopupSubMenuMenuItem('Details');

            if (light.accessoryInfo.productName) {
                detailsItem.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                    `Product: ${light.accessoryInfo.productName}`,
                    { reactive: false }
                ));
            }

            if (light.accessoryInfo.firmwareVersion) {
                detailsItem.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                    `Firmware: ${light.accessoryInfo.firmwareVersion}`,
                    { reactive: false }
                ));
            }

            if (light.accessoryInfo.serialNumber) {
                detailsItem.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                    `Serial: ${light.accessoryInfo.serialNumber}`,
                    { reactive: false }
                ));
            }

            detailsItem.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                `IP: ${light.ipAddress}`,
                { reactive: false }
            ));

            section.addMenuItem(detailsItem);
        }

        // On/Off switch
        const powerItem = new PopupMenu.PopupSwitchMenuItem('Power', false);
        powerItem.sensitive = light.isOnline;
        const powerSignalId = powerItem.connect('toggled', (item) => {
            this._setPower(index, item.state);
        });
        section.addMenuItem(powerItem);

        // Brightness slider
        const brightnessBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
        });
        const brightnessLabel = new St.Label({
            text: 'Brightness',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const brightnessSlider = new Slider.Slider(0.5);
        const brightnessSignalId = brightnessSlider.connect('notify::value', () => {
            this._setBrightness(index, brightnessSlider.value * 100);
        });

        brightnessBox.add_child(brightnessLabel);
        brightnessBox.add_child(brightnessSlider);

        const brightnessItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
        });
        brightnessItem.add_child(brightnessBox);
        brightnessItem.sensitive = light.isOnline;
        section.addMenuItem(brightnessItem);

        // Temperature slider
        const tempBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
        });
        const tempLabel = new St.Label({
            text: 'Temperature',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const tempSlider = new Slider.Slider(0.5);
        const tempSignalId = tempSlider.connect('notify::value', () => {
            // Map 0-1 to 143-344 (2900K-7000K)
            const temp = 143 + (tempSlider.value * (344 - 143));
            this._setTemperature(index, temp);
        });

        tempBox.add_child(tempLabel);
        tempBox.add_child(tempSlider);

        const tempItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
        });
        tempItem.add_child(tempBox);
        tempItem.sensitive = light.isOnline;
        section.addMenuItem(tempItem);

        // Identify button
        const identifyItem = new PopupMenu.PopupMenuItem('Identify (Flash)');
        identifyItem.sensitive = light.isOnline;
        const identifySignalId = identifyItem.connect('activate', () => {
            this._identify(index);
        });
        section.addMenuItem(identifyItem);

        // Store references and signal IDs for updates and cleanup
        section._powerSwitch = powerItem;
        section._powerSignalId = powerSignalId;
        section._brightnessSlider = brightnessSlider;
        section._brightnessItem = brightnessItem;
        section._brightnessSignalId = brightnessSignalId;
        section._tempSlider = tempSlider;
        section._tempItem = tempItem;
        section._tempSignalId = tempSignalId;
        section._identifySignalId = identifySignalId;
        section._identifyItem = identifyItem;

        return section;
    }

    async _updateAllLights() {
        for (let i = 0; i < this._lights.length; i++) {
            await this._updateLight(i);
        }
    }

    async _updateLight(index) {
        // Validate index before async operation
        if (index >= this._lights.length || index >= this._lightsSections.length) {
            return;
        }

        const light = this._lights[index];
        const section = this._lightsSections[index];

        if (!light || !section || !section._powerSwitch) return;

        const state = await light.getLights();

        // Re-validate after async operation in case array was rebuilt
        if (index >= this._lights.length || index >= this._lightsSections.length) {
            return;
        }

        // Verify we still have the same section (not rebuilt)
        if (section !== this._lightsSections[index]) {
            return;
        }

        // Update online/offline status
        const wasOnline = light.isOnline;
        const isNowOnline = state !== null;
        light.isOnline = isNowOnline;

        // If status changed, update UI
        if (wasOnline !== isNowOnline) {
            const displayName = light.displayName || light.ipAddress;
            const fullName = isNowOnline ? displayName : `${displayName} (Offline)`;
            section._nameItem.label.text = fullName;

            // Enable/disable controls based on online status
            section._powerSwitch.sensitive = isNowOnline;
            section._brightnessItem.sensitive = isNowOnline;
            section._tempItem.sensitive = isNowOnline;
            section._identifyItem.sensitive = isNowOnline;
        }

        if (state && section._powerSwitch) {
            // Update UI without triggering callbacks
            section._powerSwitch.setToggleState(state.on === 1);
            section._brightnessSlider.value = state.brightness / 100;
            // Map temperature 143-344 to 0-1
            section._tempSlider.value = (state.temperature - 143) / (344 - 143);
        }
    }

    async _setPower(index, on) {
        const light = this._lights[index];
        const section = this._lightsSections[index];

        const brightness = section._brightnessSlider.value * 100;
        const temp = 143 + (section._tempSlider.value * (344 - 143));

        await light.setLights(on, brightness, temp);
    }

    async _setBrightness(index, brightness) {
        const light = this._lights[index];
        const section = this._lightsSections[index];

        const on = section._powerSwitch.state;
        const temp = 143 + (section._tempSlider.value * (344 - 143));

        await light.setLights(on, brightness, temp);
    }

    async _setTemperature(index, temperature) {
        const light = this._lights[index];
        const section = this._lightsSections[index];

        const on = section._powerSwitch.state;
        const brightness = section._brightnessSlider.value * 100;

        await light.setLights(on, brightness, temperature);
    }

    async _identify(index) {
        const light = this._lights[index];
        await light.identify();
    }

    async _setAllPower(on) {
        const promises = [];
        for (let i = 0; i < this._lights.length; i++) {
            const section = this._lightsSections[i];
            if (section && section._powerSwitch) {
                const brightness = section._brightnessSlider.value * 100;
                const temp = 143 + (section._tempSlider.value * (344 - 143));
                promises.push(this._lights[i].setLights(on, brightness, temp));
            }
        }
        // Execute all in parallel
        await Promise.all(promises);
        // Update individual switches
        this._updateAllLights();
    }

    async _setAllBrightness(brightness) {
        const promises = [];
        for (let i = 0; i < this._lights.length; i++) {
            const section = this._lightsSections[i];
            if (section && section._powerSwitch) {
                const on = section._powerSwitch.state;
                const temp = 143 + (section._tempSlider.value * (344 - 143));
                promises.push(this._lights[i].setLights(on, brightness, temp));
            }
        }
        // Execute all in parallel
        await Promise.all(promises);
        // Update individual sliders
        this._updateAllLights();
    }

    async _setAllTemperature(temperature) {
        const promises = [];
        for (let i = 0; i < this._lights.length; i++) {
            const section = this._lightsSections[i];
            if (section && section._powerSwitch) {
                const on = section._powerSwitch.state;
                const brightness = section._brightnessSlider.value * 100;
                promises.push(this._lights[i].setLights(on, brightness, temperature));
            }
        }
        // Execute all in parallel
        await Promise.all(promises);
        // Update individual sliders
        this._updateAllLights();
    }

    _openPreferences() {
        if (this._extension) {
            this._extension.openPreferences();
        }
    }

    _scheduleUpdate() {
        if (this._updateTimeoutId) {
            return;
        }

        this._updateTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            this._updateAllLights();
            this._scheduleUpdate();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._updateTimeoutId) {
            GLib.Source.remove(this._updateTimeoutId);
            this._updateTimeoutId = null;
        }

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        // Disconnect menu item signals
        if (this._refreshItem && this._refreshSignalId) {
            this._refreshItem.disconnect(this._refreshSignalId);
            this._refreshSignalId = null;
        }

        if (this._settingsItem && this._settingsSignalId) {
            this._settingsItem.disconnect(this._settingsSignalId);
            this._settingsSignalId = null;
        }

        super.destroy();
    }
});

export default class LightyUppyExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new Indicator(this._settings, this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
