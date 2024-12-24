import os
import subprocess


source_dir = "/home/yhluo/Projects/ProPainter_website/assets/videos/temp"
save_dir = "/home/yhluo/Projects/ProPainter_website/assets/videos/mv_refine"
os.makedirs(save_dir, exist_ok=True)

for file in os.listdir(source_dir):
    # Load the video file
    video_path = os.path.join(source_dir, file)
    output_path = os.path.join(save_dir, file)

    # Construct the ffmpeg command
    command = [
        "ffmpeg",
        "-i", video_path,       # Input file
        "-vf", "reverse",       # Video filter to reverse the video
        "-af", "areverse",      # Audio filter to reverse the audio
        output_path             # Output file
    ]
    
    # Run the ffmpeg command
    subprocess.run(command)
    # print(f"Reversed {filename} -> {output_path}")