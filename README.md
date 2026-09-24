# Table Cloth · Real-to-Sim Interactive Presentation

这个目录是一套独立的网页展示，不依赖、也不会修改上级工程中的现有代码或资产。

## 启动

```bash
cd /home/sa-lab/xarm-omniverse-estimate-3d/scripts/XArm/record_data/presentation
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`。如需展示编译后的版本：

```bash
npm run build
npm run preview
```

服务器默认只绑定 `127.0.0.1`，不会将重建资产暴露到局域网。

## 展示结构

- **Real / Sim**：独立的五机位滑动对比；真实图像始终保持原始 4:3 比例，仿真画面由原来效果稳定的 PlayCanvas 实时相机逻辑生成。
- **3DGS / Neural**：独立的三维交互对比；同一受限相机同时驱动两种重建，可拖动旋转、Shift 拖动平移、滚轮缩放。
- **Policy Rollouts**：Toy Box 与 Red Ring 两个任务的仿真数据采集和真机定性执行；仿真保留 Neural/3DGS 与 high/wrist 视角，真机结果只按任务展示。
- **桌面限制**：水平 ±70°、俯仰 35–68°、距离 0.55–1.60 m，并限制平移范围；不能转到天花板，也不能把桌面缩得过小，但允许进一步放大观察细节。
- **中英切换**：页面右上角切换语言。

## 资产说明

- 网页 3DGS：709,241 个 Gaussian 的兼容展示版本，约 8.2 MB。
- Neural：桌面端约 40.6 MB；低显存或触摸设备自动选择约 7.3 MB 版本。
- Neural 色彩：按 USD 的线性 `displayColor` 数值转换，并保留 `UsdPreviewSurface` 的 roughness 0.85、metallic 0、specular 0.15。网页端不是 Isaac Sim，而是 PlayCanvas WebGL；为了接近 Isaac RTX 的最终画面，只有 Neural 相机启用 sRGB/ACES 显示变换，并使用暖色主光、冷色补光、柔和轮廓光与少量颜色匹配的环境反弹光近似。原始顶点色不被覆盖。
- 标定对比照片：从参与该 3DGS 重建的机位中选取；首屏照片来自用户指定的 `3DTables_add` 拍摄目录。
- Neural 只用于共同桌面中心下的三维浏览，不声称与真实照片像素级配准。

所有外部输入在处理前都先复制到 `.tmp/source_snapshots`。处理脚本只读取这些副本并只写入本目录。

策略执行视频可通过以下命令重新生成；脚本会把 AV1/HEVC 输入统一转换为浏览器兼容的 H.264：

```bash
npm run prepare-rollouts
```

## 验证

```bash
npm run build
npm run verify-isolation
```

`verify-isolation` 会检查所有已登记原始输入的 SHA-256，并确认 `presentation` 之外的 Git 状态与任务开始时一致。
