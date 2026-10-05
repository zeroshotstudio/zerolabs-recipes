import asyncio
import os
import struct
from bleak import BleakClient, BleakScanner
from dotenv import load_dotenv

load_dotenv()

DEVICE_NAME = os.getenv("WEARABLE_DEVICE_NAME", "Omi")
AUDIO_CHAR_UUID = os.getenv("AUDIO_CHAR_UUID", "19B10001-E8F2-537E-4F6C-D104768A1214")

def handle_audio_stream(sender, data: bytearray):
    """Process incoming 16kHz audio frames from the wearable."""
    sample_count = len(data) // 2
    samples = struct.unpack(f"{sample_count}h", data)
    print(f"[BLE Audio] Received {sample_count} samples (Peak: {max(samples)})")

async def connect_and_listen():
    print(f"Scanning for {DEVICE_NAME}...")
    device = await BleakScanner.find_device_by_name(DEVICE_NAME)
    if not device:
        print(f"Could not find {DEVICE_NAME}. Ensure wearable is powered on.")
        return

    async with BleakClient(device) as client:
        print(f"Connected to {device.name} [{device.address}]")
        await client.start_notify(AUDIO_CHAR_UUID, handle_audio_stream)
        print("Listening for real-time audio. Press Ctrl+C to stop.")
        while True:
            await asyncio.sleep(1)

if __name__ == "__main__":
    try:
        asyncio.run(connect_and_listen())
    except KeyboardInterrupt:
        print("\nDisconnected cleanly.")
