// SPDX-License-Identifier: GPL-3.0-or-later
// Avahi mDNS discovery for Elgato Key Lights

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const ELGATO_SERVICE = '_elg._tcp';

/**
 * Discover Elgato Key Lights on the local network using Avahi
 * @returns {Promise<Array<{name: string, address: string, port: number}>>}
 */
export async function discoverKeyLights() {
    try {
        // Run avahi-browse to find _elg._tcp services
        // -ptr: resolve, print all, terminate after cache exhausted
        const proc = Gio.Subprocess.new(
            ['avahi-browse', '-ptr', ELGATO_SERVICE],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        const [stdout, stderr] = await proc.communicate_utf8_async(null, null);

        if (!proc.get_successful()) {
            console.error(`avahi-browse failed: ${stderr}`);
            return [];
        }

        // Parse avahi-browse output
        return parseAvahiOutput(stdout);
    } catch (e) {
        console.error(`Error discovering lights: ${e.message}`);
        // avahi-browse might not be installed
        return [];
    }
}

/**
 * Parse avahi-browse output to extract device information
 * Format example:
 * =  wlan0 IPv4 Elgato Key Light 1A2B                 _elg._tcp            local
 *    hostname = [elgato-key-light-1a2b.local]
 *    address = [192.168.1.100]
 *    port = [9123]
 */
function parseAvahiOutput(output) {
    const lights = [];
    const lines = output.split('\n');

    let currentLight = null;

    for (const line of lines) {
        // Look for service announcement lines
        if (line.startsWith('=') && line.includes(ELGATO_SERVICE)) {
            // Extract name from service line
            const parts = line.split(/\s+/);
            // Format: = interface IPv4/IPv6 "Service Name" _elg._tcp local
            const nameStartIdx = 4;
            const nameEndIdx = parts.indexOf(ELGATO_SERVICE);
            if (nameEndIdx > nameStartIdx) {
                currentLight = {
                    name: parts.slice(nameStartIdx, nameEndIdx).join(' '),
                    address: null,
                    port: 9123, // Default
                };
            }
        }

        // Extract hostname (optional, for display)
        if (line.includes('hostname = [') && currentLight) {
            const match = line.match(/hostname = \[([^\]]+)\]/);
            if (match) {
                currentLight.hostname = match[1];
            }
        }

        // Extract IP address
        if (line.includes('address = [') && currentLight) {
            const match = line.match(/address = \[([^\]]+)\]/);
            if (match) {
                currentLight.address = match[1];
            }
        }

        // Extract port
        if (line.includes('port = [') && currentLight) {
            const match = line.match(/port = \[(\d+)\]/);
            if (match) {
                currentLight.port = parseInt(match[1]);
            }
        }

        // When we hit a blank line or another service, save current light
        if ((line.trim() === '' || line.startsWith('=')) && currentLight && currentLight.address) {
            lights.push(currentLight);
            currentLight = null;
        }
    }

    // Add last light if exists
    if (currentLight && currentLight.address) {
        lights.push(currentLight);
    }

    return lights;
}

/**
 * Check if avahi-browse is available on the system
 */
export function isAvahiAvailable() {
    try {
        const proc = Gio.Subprocess.new(
            ['which', 'avahi-browse'],
            Gio.SubprocessFlags.STDOUT_SILENCE
        );
        proc.wait(null);
        return proc.get_successful();
    } catch (e) {
        return false;
    }
}
