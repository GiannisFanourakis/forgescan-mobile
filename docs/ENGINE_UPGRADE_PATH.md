# Engine Upgrade Path

ForgeScan Android V1 uses ARCore tracked keyframes, ML Kit Subject Segmentation, and the local Android splat optimizer.

Future upgrades should focus on:

- deeper ARCore SharedCamera + Camera2 image stream integration
- stronger ARCore tracking recovery and pose-quality scoring
- production GPU/Vulkan splat optimization
- validated production `.ksplat` compatibility
- native preview rendering for MP4/GIF

Do not add bundled large segmentation models back into the normal Android path unless they are phone-safe, licensed, and verified on target devices.
