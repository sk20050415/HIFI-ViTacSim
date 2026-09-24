import "./style.css";
import { ExactComparison } from "./exact-comparison";
import { RolloutGallery } from "./rollouts";
import { ReconstructionViewer } from "./viewer";
import type { SceneManifest } from "./types";

type Language = "en" | "zh";

const translations: Record<Language, Record<string, string>> = {
  en: {
    navReal2Sim: "Real2Sim", navMethod: "Method", navActZeroShot: "ACT Zero-Shot", eyebrow: "Interactive scene reconstruction",
    heroTitleA: "HIFI-ViTacSim:", heroTitleB: "High-Fidelity Visuotactile Real2Sim2Real for Zero-Shot Robotic Manipulation",
    explore: "Explore the reconstruction", captures: "source captures", triangles: "mesh triangles",
    exactEyebrow: "Calibrated image comparison", exactTitle: "Real / Sim",
    exactIntro: "Select a calibrated camera and drag the divider. Real photographs retain their original 4:3 proportions without stretching.",
    reconstructionEyebrow: "Interactive 3D reconstruction",
    reconstructionIntro: "Both reconstructions share one constrained camera. Drag to orbit around the tabletop; the view cannot turn toward the ceiling or leave the calibrated desk region.",
    real2simIntro: "We reconstruct the physical workspace as both photorealistic appearance and continuous geometry, then use the resulting simulator for policy data collection.",
    dragCompare: "Drag to compare", cameraRange: "Camera range", reset: "Reset", camera: "Camera", loadingTitle: "Preparing interactive scene",
    orbitHelp: "Drag to orbit", panHelp: "Shift-drag to pan", zoomHelp: "Scroll to zoom", limitedHelp: "Tabletop limits active",
    rolloutEyebrow: "Policy evaluation", rolloutTitle: "Simulation-to-real policy rollouts",
    rolloutIntro: "Visual rollouts from simulation data collection and qualitative real-world deployment across two manipulation tasks.",
    simulationTitle: "Simulation data collection", simulationIntro: "Synchronized external and wrist-camera observations from both scene representations.",
    realEvaluationTitle: "Real-world evaluation", realEvaluationIntro: "Qualitative policy rollouts on the physical robot, presented by task.",
    toyBox: "Toy Box", redRing: "Red Ring", simRollout: "SIMULATION ROLLOUT", realRollout: "REAL-WORLD ROLLOUT",
    highCamera: "EXTERNAL CAMERA", wristCamera: "WRIST CAMERA",
    methodPlaceholder: "Our visual Real2Sim pipeline combines dual-camera capture, alternative background reconstruction, generated object assets, and explicit calibration to build a simulation-ready digital twin.",
    methodFigureCaption: "Overview of the complete pipeline: real-world capture, Neuralangelo or hybrid 3DGS reconstruction, generative foreground assets, dual-camera calibration, and scene registration into a common robot-base frame.",
    actIntro: "To evaluate simulator fidelity, we deliberately use ACT—a policy that relies heavily on visual observations—and deploy it zero-shot on the physical robot.",
    methodEyebrow: "Representation study", methodTitle: "Appearance and geometry, aligned.",
    methodBody: "The Gaussian representation preserves photographic appearance. The Neuralangelo mesh exposes continuous geometry. Both are placed around one tabletop focus and driven by the same constrained camera.",
    realMethod: "Calibrated phone captures preserve the original lighting and object layout.",
    gsMethod: "709,241 anisotropic Gaussians render the scene photorealistically in real time.",
    neuralMethod: "A two-million-triangle colored mesh makes the reconstructed surface directly inspectable.",
    footer: "Interactive reconstruction study",
  },
  zh: {
    navReal2Sim: "Real2Sim", navMethod: "方法", navActZeroShot: "ACT 零样本", eyebrow: "交互式场景重建",
    heroTitleA: "HIFI-ViTacSim:", heroTitleB: "High-Fidelity Visuotactile Real2Sim2Real for Zero-Shot Robotic Manipulation",
    explore: "进入交互重建", captures: "张源照片", triangles: "网格三角面",
    exactEyebrow: "标定机位图像对比", exactTitle: "真实 / 仿真",
    exactIntro: "选择标定机位并拖动分界线。真实照片始终保持原始 4:3 比例，不做拉伸。",
    reconstructionEyebrow: "交互式三维重建",
    reconstructionIntro: "两种重建共享同一受限相机。可围绕桌面拖动浏览，但不能转向天花板或离开标定桌面范围。",
    real2simIntro: "将真实工作空间重建为照片级外观与连续几何，并在生成的仿真环境中采集策略数据。",
    dragCompare: "拖动进行对比", cameraRange: "相机范围", reset: "重置", camera: "机位", loadingTitle: "正在准备交互场景",
    orbitHelp: "拖动旋转", panHelp: "Shift 拖动平移", zoomHelp: "滚轮缩放", limitedHelp: "桌面范围限制已启用",
    rolloutEyebrow: "策略评估", rolloutTitle: "从仿真到真机的策略执行",
    rolloutIntro: "展示两个操作任务中的仿真数据采集过程与真机定性执行效果。",
    simulationTitle: "仿真数据采集", simulationIntro: "同步展示两种场景表征下的外部相机与腕部相机观测。",
    realEvaluationTitle: "真机评估", realEvaluationIntro: "按任务展示机器人在真实环境中的定性策略执行过程。",
    toyBox: "玩具盒", redRing: "红环", simRollout: "仿真执行", realRollout: "真机执行",
    highCamera: "外部相机", wristCamera: "腕部相机",
    methodPlaceholder: "我们的纯视觉 Real2Sim 流程结合双相机采集、两种背景重建、生成式物体资产和显式标定，构建可直接用于仿真的数字孪生环境。",
    methodFigureCaption: "完整流程包括真实场景采集、Neuralangelo 或混合 3DGS 背景重建、生成式前景资产、双相机标定，以及将重建场景配准到统一的机器人基座坐标系。",
    actIntro: "为验证仿真器的视觉保真度，我们特意采用高度依赖视觉观测的 ACT 作为策略，并将其零样本部署到真实机器人。",
    methodEyebrow: "表征方式研究", methodTitle: "外观与几何，统一对齐。",
    methodBody: "Gaussian 表征保留照片级外观，Neuralangelo 网格提供连续几何表面；两者围绕同一桌面中心放置，并由同一个受限相机驱动。",
    realMethod: "经过标定的手机照片保留原始灯光与物体布置。",
    gsMethod: "709,241 个各向异性 Gaussian 实时呈现照片级场景外观。",
    neuralMethod: "两百万三角面的彩色网格让重建表面可以被直接检查。",
    footer: "交互式场景重建展示",
  },
};

function setLanguage(language: Language): void {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (key && translations[language][key]) element.textContent = translations[language][key];
  });
  const button = document.querySelector<HTMLButtonElement>("#language-button");
  if (button) button.textContent = language === "en" ? "中文" : "EN";
  localStorage.setItem("table-cloth-language", language);
}

async function bootstrap(): Promise<void> {
  let language: Language = localStorage.getItem("table-cloth-language") === "zh" ? "zh" : "en";
  setLanguage(language);
  document.querySelector<HTMLButtonElement>("#language-button")?.addEventListener("click", () => {
    language = language === "en" ? "zh" : "en";
    setLanguage(language);
  });
  const response = await fetch("./assets/scene-manifest.json");
  if (!response.ok) throw new Error(`Manifest request failed (${response.status})`);
  const manifest = await response.json() as SceneManifest;
  const exactComparison = new ExactComparison(manifest);
  const rolloutGallery = new RolloutGallery();
  const viewer = new ReconstructionViewer(manifest);
  Object.assign(window, { __tableClothViewer: viewer, __exactComparison: exactComparison, __rolloutGallery: rolloutGallery });
  await viewer.load();
}

bootstrap().catch((error) => {
  console.error(error);
  const panel = document.querySelector<HTMLElement>("#viewer-error");
  if (panel) {
    panel.hidden = false;
    panel.textContent = error instanceof Error ? error.message : String(error);
  }
});
