# Fremdbestandteile / Third-party components

Diese Dateien sind nicht vom Rechteinhaber von VALIS geschrieben. Für sie gilt die jeweils genannte Lizenz, nicht `LICENSE.md`. Ihre Hinweise bleiben in jeder Fassung erhalten.

*These files were not written by the rights holder of VALIS. The licence named for each applies to them, not `LICENSE.md`.*

| Datei / File | Was / What | Lizenz / Licence |
| --- | --- | --- |
| `splash/` | Splash, WebGPU-Flüssigkeitssimulation (MLS-MPM) von matsuoka-601, für VALIS angepasst | MIT, Text in `splash/LICENSE` |
| `vendor/svg-pan-zoom.min.js` | svg-pan-zoom v3.6.1 | BSD-2-Clause, Text unten |
| `vendor/qrcode.min.js` | QRCode.js von davidshimjs | MIT, Text unten |
| `vendor/lz-string.min.js` | lz-string v1.5.0 von pieroxy | MIT, Text unten |
| `splash/dist/splash.iife.js` (eingebaut) | lil-gui v0.20.0 von George Michael Brower | MIT, Text unten |
| `splash/dist/splash.iife.js` (eingebaut) | wgpu-matrix v3.3.0 von Gregg Tavares | MIT, Text unten |
| `splash/dist/cubemap/`, `splash/public/cubemap/` | Umgebungsbilder des Splash, aus der Vorlage übernommen | Herkunft offen, wird geprüft |

Die Änderungen von Christoph Mones an `splash/` stehen unter `LICENSE.md`, soweit die MIT-Lizenz der Vorlage das zulässt.

Maschinenlesbar stehen alle Fremdbestandteile mit Version in `sbom.cdx.json` (CycloneDX). *A machine-readable list with versions is in `sbom.cdx.json` (CycloneDX).*

FESTO und Festo Didactic sind Marken der Festo SE & Co. KG. VALIS ist kein Produkt von Festo und steht in keiner Verbindung zu Festo.

**Festo-Frontplatten (Steckaufbau).** Festo Didactic hat am 20.11.2026 Datenblätter und Frontplatten-Drucke der Elektro-Einheiten 162241, 162242, 162243, 162244 und 544315 zur Verfügung gestellt. Die Oberflächengrafiken dürfen **ausschließlich für die Steckaufbau-Ansicht (Patchboard) in VALIS** genutzt werden, nicht in anderen Teilen von VALIS, nicht in Unterrichtsmaterial, 3D-Räumen oder auf der Webseite, und nicht unterlizenziert werden. Das Repository enthält keine dieser Dateien: Die Platten im Steckaufbau sind eigene SVG-Zeichnungen, die Unterlagen dienten nur dazu, Buchsen, Beschriftung und Funktion abzugleichen.

*Festo front panels (patch board). Festo Didactic provided data sheets and front panel prints of units 162241, 162242, 162243, 162244 and 544315 on 20 Nov 2026. The surface graphics may be used **only for the patch board view in VALIS**, nowhere else, and may not be sublicensed. This repository contains none of these files: the panels are VALIS's own SVG drawings; the documents were only used to check sockets, labels and function.*

---

## svg-pan-zoom (BSD-2-Clause)

Copyright (c) 2009-2010 Andrea Leofreddi. Copyright (c) Anders Riutta and contributors. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## QRCode.js (MIT)

Copyright (c) 2012 davidshimjs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## lz-string (MIT)

Copyright (c) 2013 pieroxy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## lil-gui (MIT)

Copyright (c) 2019 George Michael Brower

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## wgpu-matrix (MIT)

Copyright (c) 2022 Gregg Tavares

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
