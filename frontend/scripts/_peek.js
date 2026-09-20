const path = require("path");
const { chromium } = require("@playwright/test");
(async () => {
  for (const name of ["one-face", "two-faces"]) {
    const video = path.join(__dirname, "..", ".e2e", "faces", name + ".y4m");
    const browser = await chromium.launch({ channel: "msedge", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${video}`] });
    const page = await (await browser.newContext({ permissions: ["camera"] })).newPage();
    await page.goto("http://127.0.0.1:3000/offline");
    const info = await page.evaluate(async () => {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      const v = document.createElement("video"); v.muted = true; v.srcObject = s; document.body.appendChild(v); await v.play();
      await new Promise((r) => setTimeout(r, 1500));
      const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
      return { w: v.videoWidth, h: v.videoHeight, png: c.toDataURL("image/png") };
    });
    require("fs").writeFileSync(path.join(__dirname, "..", ".e2e", "faces", `peek-${name}.png`), Buffer.from(info.png.split(",")[1], "base64"));
    console.log(name, info.w + "x" + info.h);
    await browser.close();
  }
})();
