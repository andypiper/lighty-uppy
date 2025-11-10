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
        console.log('[Discovery] Starting mDNS discovery for Elgato Key Lights...');

        // Run avahi-browse to find _elg._tcp services
        // -ptr: resolve, print all, terminate after cache exhausted
        const proc = Gio.Subprocess.new(
            ['avahi-browse', '-ptr', ELGATO_SERVICE],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        // Use synchronous communicate since avahi-browse terminates quickly
        const [, stdout, stderr] = proc.communicate_utf8(null, null);

        console.log(`[Discovery] avahi-browse stdout: ${stdout}`);
        if (stderr) {
            console.log(`[Discovery] avahi-browse stderr: ${stderr}`);
        }

        if (!proc.get_successful()) {
            console.error(`[Discovery] avahi-browse failed with exit code, stderr: ${stderr}`);
            return [];
        }

        // Parse avahi-browse output
        const lights = parseAvahiOutput(stdout);
        console.log(`[Discovery] Found ${lights.length} light(s):`, JSON.stringify(lights));
        return lights;
    } catch (e) {
        console.error(`[Discovery] Error discovering lights: ${e.message}`);
        console.error(`[Discovery] Stack trace:`, e.stack);
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
