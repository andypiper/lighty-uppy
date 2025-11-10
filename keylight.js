// SPDX-License-Identifier: GPL-3.0-or-later
// Elgato Key Light API Client

import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const KEYLIGHT_PORT = 9123;
const MDNS_SERVICE = '_elg._tcp.local';

export class KeyLight {
    constructor(ipAddress, name = 'Key Light') {
        this.ipAddress = ipAddress;
        this.name = name;
        this.baseUrl = `http://${ipAddress}:${KEYLIGHT_PORT}/elgato`;

        this._httpSession = new Soup.Session({
            timeout: 10,
        });
    }

    /**
     * Get current light state
     * @returns {Promise<Object>} Light state with on, brightness, temperature
     */
    async getLights() {
        try {
            const message = Soup.Message.new('GET', `${this.baseUrl}/lights`);
            const bytes = await new Promise((resolve, reject) => {
                this._httpSession.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (session, result) => {
                        try {
                            const bytes = session.send_and_read_finish(result);
                            resolve(bytes);
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });

            if (message.status_code !== 200) {
                throw new Error(`HTTP ${message.status_code}`);
            }

            const decoder = new TextDecoder('utf-8');
            const response = JSON.parse(decoder.decode(bytes.get_data()));

            if (response.lights && response.lights.length > 0) {
                return response.lights[0];
            }
            return null;
        } catch (e) {
            console.error(`Error getting lights: ${e.message}`);
            return null;
        }
    }

    /**
     * Update light state
     * @param {boolean} on - Power state
     * @param {number} brightness - Brightness 0-100
     * @param {number} temperature - Temperature 143-344 (2900K-7000K)
     */
    async setLights(on, brightness, temperature) {
        try {
            const payload = {
                numberOfLights: 1,
                lights: [{
                    on: on ? 1 : 0,
                    brightness: Math.round(brightness),
                    temperature: Math.round(temperature)
                }]
            };

            const message = Soup.Message.new('PUT', `${this.baseUrl}/lights`);
            message.set_request_body_from_bytes(
                'application/json',
                new GLib.Bytes(JSON.stringify(payload))
            );

            await new Promise((resolve, reject) => {
                this._httpSession.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (session, result) => {
                        try {
                            session.send_and_read_finish(result);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });

            return message.status_code === 200;
        } catch (e) {
            console.error(`Error setting lights: ${e.message}`);
            return false;
        }
    }

    /**
     * Flash the light to identify it
     */
    async identify() {
        try {
            const message = Soup.Message.new('POST', `${this.baseUrl}/identify`);
            await new Promise((resolve, reject) => {
                this._httpSession.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (session, result) => {
                        try {
                            session.send_and_read_finish(result);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });
            return message.status_code === 200;
        } catch (e) {
            console.error(`Error identifying light: ${e.message}`);
            return false;
        }
    }

    /**
     * Get accessory information
     */
    async getAccessoryInfo() {
        try {
            const message = Soup.Message.new('GET', `${this.baseUrl}/accessory-info`);
            const bytes = await new Promise((resolve, reject) => {
                this._httpSession.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (session, result) => {
                        try {
                            const bytes = session.send_and_read_finish(result);
                            resolve(bytes);
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });

            if (message.status_code !== 200) {
                return null;
            }

            const decoder = new TextDecoder('utf-8');
            const response = JSON.parse(decoder.decode(bytes.get_data()));
            return response;
        } catch (e) {
            console.error(`Error getting accessory info: ${e.message}`);
            return null;
        }
    }
}
