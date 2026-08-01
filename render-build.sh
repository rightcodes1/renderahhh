#!/usr/bin/env bash
# Download yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o yt-dlp
chmod +x yt-dlp

# Download & extract static ffmpeg into ./bin/
mkdir -p bin
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz -C bin/ --strip-components=1
chmod +x bin/ffmpeg bin/ffprobe
rm ffmpeg.tar.xz
