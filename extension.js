// SPDX-License-Identifier: GPL-3.0-or-later
// Lighty Uppy - Elgato Key Light Control for GNOME Shell

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {KeyLight} from './keylight.js';

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, 'Lighty Uppy');

        this._settings = settings;
        this._lights = [];
        this._updateTimeoutId = null;

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

        // Update state periodically
        this._scheduleUpdate();
    }

    _buildMenu() {
        this._lightsSections = [];

        // Add refresh button at top
        const refreshItem = new PopupMenu.PopupMenuItem('Refresh');
        refreshItem.connect('activate', () => this._updateAllLights());
        this.menu.addMenuItem(refreshItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Placeholder for no lights
        this._noLightsLabel = new PopupMenu.PopupMenuItem('No lights configured', {
            reactive: false,
        });
        this.menu.addMenuItem(this._noLightsLabel);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Settings button
        const settingsItem = new PopupMenu.PopupMenuItem('Settings');
        settingsItem.connect('activate', () => {
            this.menu.close();
            // TODO: Open preferences
        });
        this.menu.addMenuItem(settingsItem);
    }

    _loadLights() {
        const ips = this._settings.get_strv('light-ips');

        this._lights = ips.map(ip => new KeyLight(ip, ip));

        // Rebuild light controls
        this._rebuildLightControls();

        // Update state
        this._updateAllLights();
    }

    _rebuildLightControls() {
        // Remove old sections
        this._lightsSections.forEach(section => section.destroy());
        this._lightsSections = [];

        if (this._lights.length === 0) {
            this._noLightsLabel.visible = true;
            return;
        }

        this._noLightsLabel.visible = false;

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

    _createLightSection(light, index) {
        const section = new PopupMenu.PopupMenuSection();

        // Light name/IP
        const nameItem = new PopupMenu.PopupMenuItem(light.ipAddress, {
            reactive: false,
            can_focus: false,
        });
        section.addMenuItem(nameItem);

        // On/Off switch
        const powerItem = new PopupMenu.PopupSwitchMenuItem('Power', false);
        powerItem.connect('toggled', (item) => {
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
        brightnessSlider.connect('notify::value', () => {
            this._setBrightness(index, brightnessSlider.value * 100);
        });

        brightnessBox.add_child(brightnessLabel);
        brightnessBox.add_child(brightnessSlider);

        const brightnessItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
        });
        brightnessItem.add_child(brightnessBox);
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
        tempSlider.connect('notify::value', () => {
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
        section.addMenuItem(tempItem);

        // Identify button
        const identifyItem = new PopupMenu.PopupMenuItem('Identify (Flash)');
        identifyItem.connect('activate', () => {
            this._identify(index);
        });
        section.addMenuItem(identifyItem);

        // Store references for updates
        section._powerSwitch = powerItem;
        section._brightnessSlider = brightnessSlider;
        section._tempSlider = tempSlider;

        return section;
    }

    async _updateAllLights() {
        for (let i = 0; i < this._lights.length; i++) {
            await this._updateLight(i);
        }
    }

    async _updateLight(index) {
        const light = this._lights[index];
        const section = this._lightsSections[index];

        if (!section || !section._powerSwitch) return;

        const state = await light.getLights();
        if (state) {
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

    _scheduleUpdate() {
        if (this._updateTimeoutId) {
            return;
        }

        this._updateTimeoutId = setTimeout(() => {
            this._updateTimeoutId = null;
            this._updateAllLights();
            this._scheduleUpdate();
        }, 5000); // Update every 5 seconds
    }

    destroy() {
        if (this._updateTimeoutId) {
            clearTimeout(this._updateTimeoutId);
            this._updateTimeoutId = null;
        }

        super.destroy();
    }
});

export default class LightyUppyExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new Indicator(this._settings);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
