# Windows / PowerShell: rebuild three cutouts from the original photographs.
# Masks only affect alpha. Opaque cover pixels retain the original decoded RGB.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$drawingReferences = @('System.Drawing.Common.dll','System.Drawing.Primitives.dll','System.Private.Windows.GdiPlus.dll','System.Private.Windows.Core.dll') |
  ForEach-Object { Join-Path $PSHOME $_ } | Where-Object { Test-Path -LiteralPath $_ }
Add-Type -ReferencedAssemblies $drawingReferences -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class BookCutouts {
  static byte[] Pixels(Bitmap bitmap) {
    var data=bitmap.LockBits(new Rectangle(0,0,bitmap.Width,bitmap.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
    try {var bytes=new byte[data.Stride*bitmap.Height];Marshal.Copy(data.Scan0,bytes,0,bytes.Length);return bytes;}
    finally {bitmap.UnlockBits(data);}
  }
  public static string Prepare(string source,string destination,float[] points) {
    using(var original=new Bitmap(source))
    using(var decoded=new Bitmap(original.Width,original.Height,PixelFormat.Format32bppArgb))
    using(var mask=new Bitmap(original.Width,original.Height,PixelFormat.Format32bppArgb))
    using(var path=new GraphicsPath()) {
      if(original.Width!=1060||original.Height!=1484)throw new Exception("Mask dimensions no longer match the source.");
      using(var g=Graphics.FromImage(decoded)){g.CompositingMode=CompositingMode.SourceCopy;g.DrawImageUnscaled(original,0,0);}
      var polygon=new PointF[points.Length/2];
      for(int i=0;i<polygon.Length;i++)polygon[i]=new PointF(points[i*2],points[i*2+1]);
      path.AddPolygon(polygon);
      using(var g=Graphics.FromImage(mask)){g.Clear(Color.Transparent);g.SmoothingMode=SmoothingMode.AntiAlias;g.FillPath(Brushes.White,path);}
      var rgb=Pixels(decoded);var alpha=Pixels(mask);
      const int left=100,top=130,width=940,height=1200;
      var rgba=new byte[width*height*4];int opaque=0,transparent=0;
      for(int y=0;y<height;y++)for(int x=0;x<width;x++){
        int src=((y+top)*original.Width+x+left)*4,dst=(y*width+x)*4;
        byte a=alpha[src+3];
        // A one-pixel inset removes color spill at the photographed edges.
        for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++)a=Math.Min(a,alpha[src+(dy*original.Width+dx)*4+3]);
        rgba[dst+3]=a;
        if(a==0){transparent++;continue;}
        for(int c=0;c<3;c++)rgba[dst+c]=rgb[src+c];
        if(a==255)opaque++;
      }
      using(var output=new Bitmap(width,height,PixelFormat.Format32bppArgb)){
        var data=output.LockBits(new Rectangle(0,0,width,height),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
        try {Marshal.Copy(rgba,0,data.Scan0,rgba.Length);}finally{output.UnlockBits(data);}
        output.Save(destination,ImageFormat.Png);
      }
      using(var check=new Bitmap(destination)){
        var saved=Pixels(check);
        for(int y=0;y<height;y++)for(int x=0;x<width;x++){
          int dst=(y*width+x)*4,src=((y+top)*original.Width+x+left)*4;
          if(saved[dst+3]==255)for(int c=0;c<3;c++)if(saved[dst+c]!=rgb[src+c])throw new Exception("Cover RGB changed.");
        }
        if(check.GetPixel(0,0).A!=0||check.GetPixel(width-1,0).A!=0||check.GetPixel(0,height-1).A!=0||check.GetPixel(width-1,height-1).A!=0)throw new Exception("Expected transparent corners.");
      }
      return opaque+" opaque pixels unchanged; "+transparent+" transparent pixels.";
    }
  }
}
'@
$projectRoot = Split-Path -Parent $PSScriptRoot
$booksRoot = Join-Path $projectRoot 'public/assets/books'
$outputRoot = Join-Path $booksRoot 'cutouts'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$books = @(
  @{
    Source='70_de_but_toc_thi_vao_lop_6_clc.jpg'; Output='70-de-vao-6.png'
    SHA256='3EA97E2914E7ED96F9FCD3C31C94DA03237CD51914D387E598F0DA237EF84F63'
    Points=[float[]]@(114,197,115,185,122,174,140,156,153,146,161,142,168,142,177,146,182,146,192,141,201,141,250,143,350,147,500,151,650,157,800,162,820,163,825,166,828,175,1007,1190,1008,1197,1005,1201,997,1203,963,1258,900,1259,800,1261,650,1265,500,1269,350,1276,250,1283,190,1291,181,1307,176,1306,174,1301,114,206)
  },
  @{
    Source='Phan dang toan lop6 t1.png'; Output='toan-6-tap-1.png'
    SHA256='1A464E4F2B60DB2346292C60A973421E65CBA34C1978214B45900084E0F7D50E'
    Points=[float[]]@(116,198,117,188,123,178,143,158,154,151,161,149,170,150,179,152,186,152,195,147,203,147,819,155,825,158,828,169,1020,1226,1020,1232,1017,1234,1003,1235,965,1282,966,1285,958,1287,900,1288,800,1290,650,1294,500,1297,350,1301,250,1305,190,1307,183,1313,177,1314,175,1309,116,212)
  },
  @{
    Source='Phan dang toan lop6 t2.png'; Output='toan-6-tap-2.png'
    SHA256='029F3629C48878AC73B198C8B325097FAC45F914E2A991C4BEEDDDA6607F0FD3'
    Points=[float[]]@(125,205,126,192,132,180,148,160,157,152,163,149,169,150,178,152,187,151,196,145,204,145,819,158,826,161,829,172,997,1218,997,1225,994,1228,984,1229,951,1279,952,1285,945,1288,191,1309,182,1310,178,1306,125,217)
  }
)
foreach($book in $books){
  $sourcePath=Join-Path $booksRoot $book.Source
  if((Get-FileHash -Algorithm SHA256 -LiteralPath $sourcePath).Hash -ne $book.SHA256){throw "Source changed; review the mask before processing: $($book.Source)"}
  $destination=Join-Path $outputRoot $book.Output
  $result=[BookCutouts]::Prepare($sourcePath,$destination,$book.Points)
  Write-Output "$($book.Output): $result"
}
