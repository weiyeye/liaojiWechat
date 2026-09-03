param(
  [Parameter(Mandatory = $true)]
  [string]$Source,

  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
  $ProjectRoot = Split-Path -Parent $scriptDirectory
}

$resolvedSource = [System.IO.Path]::GetFullPath($Source)
$resolvedRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath $resolvedSource -PathType Leaf)) {
  throw "Source image not found: $resolvedSource"
}

$outputs = @{
  Raw        = Join-Path $resolvedRoot 'assets\branding\weport-icon-generated.png'
  Branding = Join-Path $resolvedRoot 'assets\branding\weport-icon.png'
  LegacyJpeg = Join-Path $resolvedRoot 'assets\branding\weport-icon.jpg'
  App      = Join-Path $resolvedRoot 'assets\icons\icon.png'
  Public   = Join-Path $resolvedRoot 'public\icon.png'
  Icns     = Join-Path $resolvedRoot 'resources\icons\macos\icon.icns'
}

foreach ($path in $outputs.Values) {
  $resolvedOutput = [System.IO.Path]::GetFullPath($path)
  if (-not $resolvedOutput.StartsWith(
      $resolvedRoot + [System.IO.Path]::DirectorySeparatorChar,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw "Output escaped project root: $resolvedOutput"
  }
}

Copy-Item -LiteralPath $resolvedSource -Destination $outputs.Raw -Force

Add-Type -AssemblyName System.Drawing

$builderSource = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class WeportIconBuilder
{
    public static void Build(
        string sourcePath,
        string brandingPath,
        string legacyJpegPath,
        string appPath,
        string publicPath,
        string icnsPath)
    {
        using (var source = new Bitmap(sourcePath))
        using (var masked = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(masked))
            {
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.DrawImage(source, 0, 0, source.Width, source.Height);
            }

            ApplySquircleAlpha(masked);

            using (var master = Resize(masked, 1024))
            {
                SavePng(master, brandingPath);
                SaveJpeg(master, legacyJpegPath);
                SavePng(master, appPath);
                SavePng(master, publicPath);
                SaveIcns(master, icnsPath);
            }
        }
    }

    private static void ApplySquircleAlpha(Bitmap bitmap)
    {
        var rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        var data = bitmap.LockBits(
            rect,
            ImageLockMode.ReadWrite,
            PixelFormat.Format32bppArgb);

        try
        {
            int length = Math.Abs(data.Stride) * data.Height;
            var pixels = new byte[length];
            Marshal.Copy(data.Scan0, pixels, 0, length);

            double centerX = bitmap.Width / 2.0;
            double centerY = bitmap.Height / 2.0;
            double half = Math.Min(bitmap.Width, bitmap.Height) / 2.0 - 3.5;
            const double featherStart = 0.985;

            for (int y = 0; y < bitmap.Height; y++)
            {
                double normalizedY = Math.Abs((y + 0.5 - centerY) / half);
                double normalizedY4 = Math.Pow(normalizedY, 4);
                int row = y * data.Stride;

                for (int x = 0; x < bitmap.Width; x++)
                {
                    double normalizedX = Math.Abs((x + 0.5 - centerX) / half);
                    double edge = Math.Pow(normalizedX, 4) + normalizedY4;
                    int alphaIndex = row + x * 4 + 3;

                    if (edge >= 1.0)
                    {
                        pixels[alphaIndex] = 0;
                    }
                    else if (edge > featherStart)
                    {
                        double coverage = (1.0 - edge) / (1.0 - featherStart);
                        pixels[alphaIndex] = (byte)Math.Min(
                            pixels[alphaIndex],
                            Math.Max(0, Math.Round(coverage * 255.0)));
                    }
                    else
                    {
                        pixels[alphaIndex] = 255;
                    }
                }
            }

            Marshal.Copy(pixels, 0, data.Scan0, length);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }

    private static Bitmap Resize(Image source, int size)
    {
        var output = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        output.SetResolution(144, 144);

        using (var graphics = Graphics.FromImage(output))
        {
            graphics.CompositingMode = CompositingMode.SourceCopy;
            graphics.CompositingQuality = CompositingQuality.HighQuality;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.SmoothingMode = SmoothingMode.HighQuality;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.Clear(Color.Transparent);
            graphics.DrawImage(
                source,
                new Rectangle(0, 0, size, size),
                0,
                0,
                source.Width,
                source.Height,
                GraphicsUnit.Pixel);
        }

        return output;
    }

    private static void SavePng(Image image, string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        image.Save(path, ImageFormat.Png);
    }

    private static void SaveJpeg(Image image, string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        using (var flattened = new Bitmap(image.Width, image.Height, PixelFormat.Format24bppRgb))
        using (var graphics = Graphics.FromImage(flattened))
        {
            graphics.Clear(Color.FromArgb(13, 16, 22));
            graphics.DrawImage(image, 0, 0, image.Width, image.Height);
            flattened.Save(path, ImageFormat.Jpeg);
        }
    }

    private static byte[] PngBytes(Image image)
    {
        using (var stream = new MemoryStream())
        {
            image.Save(stream, ImageFormat.Png);
            return stream.ToArray();
        }
    }

    private static void WriteBigEndian(BinaryWriter writer, int value)
    {
        writer.Write(new byte[]
        {
            (byte)((value >> 24) & 0xff),
            (byte)((value >> 16) & 0xff),
            (byte)((value >> 8) & 0xff),
            (byte)(value & 0xff)
        });
    }

    private static void SaveIcns(Image master, string path)
    {
        var specs = new[]
        {
            Tuple.Create("icp4", 16),
            Tuple.Create("icp5", 32),
            Tuple.Create("icp6", 64),
            Tuple.Create("ic07", 128),
            Tuple.Create("ic08", 256),
            Tuple.Create("ic09", 512),
            Tuple.Create("ic10", 1024),
            Tuple.Create("ic11", 32),
            Tuple.Create("ic12", 64),
            Tuple.Create("ic13", 256),
            Tuple.Create("ic14", 512)
        };

        var chunks = new List<Tuple<string, byte[]>>();
        int totalLength = 8;

        foreach (var spec in specs)
        {
            using (var resized = Resize(master, spec.Item2))
            {
                byte[] png = PngBytes(resized);
                chunks.Add(Tuple.Create(spec.Item1, png));
                totalLength += 8 + png.Length;
            }
        }

        Directory.CreateDirectory(Path.GetDirectoryName(path));
        using (var stream = File.Create(path))
        using (var writer = new BinaryWriter(stream))
        {
            writer.Write(new byte[] { (byte)'i', (byte)'c', (byte)'n', (byte)'s' });
            WriteBigEndian(writer, totalLength);
            foreach (var chunk in chunks)
            {
                writer.Write(System.Text.Encoding.ASCII.GetBytes(chunk.Item1));
                WriteBigEndian(writer, 8 + chunk.Item2.Length);
                writer.Write(chunk.Item2);
            }
        }
    }
}
'@

Add-Type -TypeDefinition $builderSource -ReferencedAssemblies System.Drawing

[WeportIconBuilder]::Build(
  $resolvedSource,
  $outputs.Branding,
  $outputs.LegacyJpeg,
  $outputs.App,
  $outputs.Public,
  $outputs.Icns
)

$outputs.Values |
  ForEach-Object { Get-Item -LiteralPath $_ } |
  Sort-Object FullName |
  Select-Object FullName, Length, LastWriteTime
