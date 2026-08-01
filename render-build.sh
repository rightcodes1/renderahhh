#!/usr/bin/env bash

# Download yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o yt-dlp
chmod +x yt-dlp

# Download static ffmpeg (required for merging video+audio)
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz
mv ffmpeg-*-amd64-static/ffmpeg ffmpeg
mv ffmpeg-*-amd64-static/ffprobe ffprobe
chmod +x ffmpeg ffprobe
rm -rf ffmpeg-*-amd64-static ffmpeg.tar.xz
