/* Phase 03 · scene / device / knowledge registry
 * Single source of truth for zoneId, stageId, objectId and semantic anchors.
 * Loaded before immersion.js; no build step.
 */
(function () {
  'use strict';

  var SCENE_ID = 'petro-chain-v3';

  var ZONES = [
    { zoneId: 'subsurface', name: '地下地质区', stageId: 'drill', stageIndex: 0, center: [-24, 0, 8], size: [17, 13], elevation: [ -6, 0 ], entryAnchor: 'wellbore_top_anchor', exitAnchor: 'wellhead', camera: 'cam_subsurface', path: 'path_sub_oil' },
    { zoneId: 'oilfield', name: '油田生产区', stageId: 'drill', stageIndex: 0, center: [-24, 0, 8], size: [17, 13], elevation: [ 0, 3 ], entryAnchor: 'wellhead', exitAnchor: 'wellhead', camera: 'cam_wellhead', path: 'path_oil_gather' },
    { zoneId: 'gathering', name: '集输处理区', stageId: 'gather', stageIndex: 1, center: [-6, 0.6, 2], size: [13, 10], elevation: [ 0, 4 ], entryAnchor: 'separator_inlet', exitAnchor: 'separator_outlet', camera: 'cam_separator', path: 'path_gather_store' },
    { zoneId: 'storage', name: '储运区', stageId: 'store', stageIndex: 2, center: [10, 1.6, -5], size: [13, 10], elevation: [ 1.6, 5 ], entryAnchor: 'tank_inlet', exitAnchor: 'tank_outlet', camera: 'cam_tank', path: 'path_store_refine' },
    { zoneId: 'refining', name: '炼化区', stageId: 'refine', stageIndex: 3, center: [24, 2.6, -11], size: [16, 11], elevation: [ 2.6, 14 ], entryAnchor: 'refinery_feed', exitAnchor: 'refinery_product', camera: 'cam_tower', path: 'path_refine_city' },
    { zoneId: 'city', name: '产品应用区', stageId: 'use', stageIndex: 4, center: [27, 0.9, 8], size: [14, 10], elevation: [ 0.9, 6 ], entryAnchor: 'city_gate', exitAnchor: 'city_delivery', camera: 'cam_city', path: 'path_refine_city' }
  ];

  var CAMERAS = {
    cam_vista: { position: [2, 18, 40], lookAt: [1, 1.5, 0], zoneId: null },
    cam_subsurface: { position: [-12, 2.4, 18], lookAt: [-24, -1.5, 7], zoneId: 'subsurface' },
    cam_wellhead: { position: [-18, 7, 21], lookAt: [-24, 1.2, 8], zoneId: 'oilfield' },
    cam_separator: { position: [1, 6, 15], lookAt: [-6, 2.2, 2], zoneId: 'gathering' },
    cam_tank: { position: [15, 10, 7], lookAt: [10, 2.5, -5], zoneId: 'storage' },
    cam_tower: { position: [28, 15, 8], lookAt: [24, 5.5, -11], zoneId: 'refining' },
    cam_city: { position: [28, 6, 20], lookAt: [27, 2.2, 8], zoneId: 'city' }
  };

  var DEVICES = [
    {
      objectId: 'pumpjack', displayName: '抽油机', zoneId: 'oilfield', stageId: 'drill', stageIndex: 0,
      knowledgeIds: ['kb_formation', 'kb_drill'], chapterId: 'drill', levelIndex: 0,
      modelPath: 'assets/hero/pumpjack/pumpjack.obj', modelNode: 'pumpjack_static/pumpjack_beam/pumpjack_crank',
      overviewRepresentation: 'pumpjack_overview', detailRepresentation: null, anchor: 'pumpjack',
      capabilities: ['select', 'animation'], assetStatus: 'reuse', interaction: ['select', 'animate']
    },
    {
      objectId: 'wellhead', displayName: '井口 / 采油树', zoneId: 'oilfield', stageId: 'drill', stageIndex: 0,
      knowledgeIds: ['kb_formation', 'kb_drill'], chapterId: 'drill', levelIndex: 0,
      modelPath: 'assets/hero/wellhead/wellhead.obj', modelNode: 'wellhead',
      overviewRepresentation: 'wellhead_overview', detailRepresentation: null, anchor: 'wellhead',
      capabilities: ['select', 'valve'], assetStatus: 'reuse', interaction: ['select', 'openValve']
    },
    {
      objectId: 'underground_geology', displayName: '地下地质剖面', zoneId: 'subsurface', stageId: 'drill', stageIndex: 0,
      knowledgeIds: ['kb_formation'], chapterId: 'drill', levelIndex: 0,
      modelPath: 'assets/underground/underground.obj', modelNode: 'geo_overburden/geo_caprock/geo_reservoir_layer/geo_basement',
      overviewRepresentation: null, detailRepresentation: 'underground_geology_detail', anchor: 'reservoir_anchor',
      capabilities: ['select', 'structure', 'layers'], assetStatus: 'new', interaction: ['select', 'toggleLayer']
    },
    {
      objectId: 'reservoir', displayName: '储层', zoneId: 'subsurface', stageId: 'drill', stageIndex: 0,
      knowledgeIds: ['kb_formation', 'kb_drill'], chapterId: 'drill', levelIndex: 0,
      modelPath: 'assets/underground/underground.obj', modelNode: 'reservoir_lens/geo_reservoir_layer',
      overviewRepresentation: null, detailRepresentation: 'underground_reservoir_detail', anchor: 'reservoir_anchor',
      capabilities: ['select', 'pores', 'fluids'], assetStatus: 'new', interaction: ['select', 'inspectPores']
    },
    {
      objectId: 'wellbore', displayName: '井筒 / 套管', zoneId: 'subsurface', stageId: 'drill', stageIndex: 0,
      knowledgeIds: ['kb_formation', 'kb_drill'], chapterId: 'drill', levelIndex: 0,
      modelPath: 'assets/underground/underground.obj', modelNode: 'well_casing/well_cement/well_tubing/well_perforation_00',
      overviewRepresentation: 'wellbore_overview', detailRepresentation: 'underground_wellbore_detail', anchor: 'wellbore_reservoir_anchor',
      capabilities: ['select', 'structure', 'trace'], assetStatus: 'new', interaction: ['select', 'toggleCasing', 'traceUp']
    },
    {
      objectId: 'three_phase_separator', displayName: '三相分离器', zoneId: 'gathering', stageId: 'gather', stageIndex: 1,
      knowledgeIds: ['kb_gather'], chapterId: 'gather', levelIndex: 1,
      modelPath: 'assets/hero/separator/separator.obj', modelNode: 'separator',
      overviewRepresentation: 'separator_overview', detailRepresentation: null, anchor: 'separator',
      capabilities: ['select', 'structure', 'animation'], assetStatus: 'refine', interaction: ['select', 'cut', 'run', 'setGasRoute']
    },
    {
      objectId: 'transfer_pump', displayName: '转输泵组', zoneId: 'storage', stageId: 'store', stageIndex: 2,
      knowledgeIds: ['kb_store'], chapterId: 'store', levelIndex: 2,
      modelPath: null, modelNode: 'transfer_pump',
      overviewRepresentation: 'transfer_pump_overview', detailRepresentation: 'transfer_pump_detail', anchor: 'transfer_pump',
      capabilities: ['select', 'pump'], assetStatus: 'reuse', interaction: ['select', 'startPump']
    },
    {
      objectId: 'fixed_roof_tank', displayName: '固定顶储罐', zoneId: 'storage', stageId: 'store', stageIndex: 2,
      knowledgeIds: ['kb_store'], chapterId: 'store', levelIndex: 2,
      modelPath: 'assets/hero/floating_roof_tank/floating_roof_tank.obj', modelNode: 'tank_shell',
      overviewRepresentation: 'fixed_tank_overview', detailRepresentation: null, anchor: 'fixed_tank',
      capabilities: ['select', 'level'], assetStatus: 'refine', interaction: ['select', 'setLevel']
    },
    {
      objectId: 'floating_roof_tank', displayName: '外浮顶储罐', zoneId: 'storage', stageId: 'store', stageIndex: 2,
      knowledgeIds: ['kb_store'], chapterId: 'store', levelIndex: 2,
      modelPath: 'assets/hero/floating_roof_tank/floating_roof_tank.obj', modelNode: 'tank_shell',
      overviewRepresentation: 'floating_tank_overview', detailRepresentation: null, anchor: 'floating_tank',
      capabilities: ['select', 'level', 'roof'], assetStatus: 'reuse', interaction: ['select', 'setLevel']
    },
    {
      objectId: 'atmospheric_tower', displayName: '常压蒸馏塔', zoneId: 'refining', stageId: 'refine', stageIndex: 3,
      knowledgeIds: ['kb_refine'], chapterId: 'refine', levelIndex: 3,
      modelPath: 'assets/tower/tower.obj', modelNode: 'Tower_Atmospheric_Shell',
      overviewRepresentation: 'atm_tower_overview', detailRepresentation: 'atmospheric_tower_detail', anchor: 'anchor_tower_overview',
      capabilities: ['select', 'structure', 'animation', 'feed', 'fractions'], assetStatus: 'hero', interaction: ['select', 'cut', 'run', 'feed', 'selectFraction']
    },
    {
      objectId: 'vacuum_tower', displayName: '减压蒸馏塔', zoneId: 'refining', stageId: 'refine', stageIndex: 3,
      knowledgeIds: ['kb_refine'], chapterId: 'refine', levelIndex: 3,
      modelPath: 'assets/tower/tower.obj', modelNode: 'Tower_Vacuum_Shell',
      overviewRepresentation: 'vac_tower_overview', detailRepresentation: 'vacuum_tower_detail', anchor: 'anchor_tower_vacuum',
      capabilities: ['select', 'structure'], assetStatus: 'hero', interaction: ['select', 'cut']
    },
    {
      objectId: 'heater', displayName: '加热炉', zoneId: 'refining', stageId: 'refine', stageIndex: 3,
      knowledgeIds: ['kb_refine'], chapterId: 'refine', levelIndex: 3,
      modelPath: 'assets/tower/tower.obj', modelNode: 'Heater',
      overviewRepresentation: 'heater_overview', detailRepresentation: 'heater_detail', anchor: 'anchor_tower_heater',
      capabilities: ['select', 'animation'], assetStatus: 'hero', interaction: ['select', 'run']
    },
    {
      objectId: 'fuel_dispenser', displayName: '加油机', zoneId: 'city', stageId: 'use', stageIndex: 4,
      knowledgeIds: ['kb_use'], chapterId: 'use', levelIndex: 4,
      modelPath: null, modelNode: 'fuel_dispenser',
      overviewRepresentation: 'dispenser_overview', detailRepresentation: null, anchor: 'fuel_dispenser',
      capabilities: ['select', 'product'], assetStatus: 'reuse', interaction: ['select', 'assignProduct']
    },
    {
      objectId: 'plastic_bottle', displayName: '塑料制品', zoneId: 'city', stageId: 'use', stageIndex: 4,
      knowledgeIds: ['kb_use'], chapterId: 'use', levelIndex: 4,
      modelPath: null, modelNode: 'plastic_bottle',
      overviewRepresentation: 'plastic_overview', detailRepresentation: null, anchor: 'plastic',
      capabilities: ['select', 'product'], assetStatus: 'placeholder', interaction: ['select', 'assignProduct']
    },
    {
      objectId: 'fiber_spool', displayName: '合成纤维', zoneId: 'city', stageId: 'use', stageIndex: 4,
      knowledgeIds: ['kb_use'], chapterId: 'use', levelIndex: 4,
      modelPath: null, modelNode: 'fiber_spool',
      overviewRepresentation: 'fiber_overview', detailRepresentation: null, anchor: 'fiber',
      capabilities: ['select', 'product'], assetStatus: 'placeholder', interaction: ['select', 'assignProduct']
    },
    {
      objectId: 'lubricant_can', displayName: '润滑油', zoneId: 'city', stageId: 'use', stageIndex: 4,
      knowledgeIds: ['kb_use'], chapterId: 'use', levelIndex: 4,
      modelPath: null, modelNode: 'lubricant_can',
      overviewRepresentation: 'lubricant_overview', detailRepresentation: null, anchor: 'lubricant',
      capabilities: ['select', 'product'], assetStatus: 'placeholder', interaction: ['select', 'assignProduct']
    },
    {
      objectId: 'asphalt_slab', displayName: '沥青路面', zoneId: 'city', stageId: 'use', stageIndex: 4,
      knowledgeIds: ['kb_use'], chapterId: 'use', levelIndex: 4,
      modelPath: null, modelNode: 'asphalt_slab',
      overviewRepresentation: 'asphalt_overview', detailRepresentation: null, anchor: 'asphalt',
      capabilities: ['select', 'product'], assetStatus: 'placeholder', interaction: ['select', 'assignProduct']
    }
  ];

  var ROUTES = [
    { pathId: 'path_sub_oil', from: 'subsurface', to: 'oilfield', mode: 'wellbore', label: '井筒 · 教学追踪' },
    { pathId: 'path_oil_gather', from: 'oilfield', to: 'gathering', mode: 'pipe', label: '井口 → 集输' },
    { pathId: 'path_gather_store', from: 'gathering', to: 'storage', mode: 'pipe', label: '处理后油相 → 储运' },
    { pathId: 'path_store_refine', from: 'storage', to: 'refining', mode: 'pipe', label: '储运 → 炼化' },
    { pathId: 'path_refine_city', from: 'refining', to: 'city', mode: 'product', label: '产品 → 应用' }
  ];

  var ENDPOINTS = [
    { endpointId: 'gas_recovery_header', displayName: '燃料气管网', zoneId: 'gathering', anchor: 'gas_header', interactive: false },
    { endpointId: 'flare_stack', displayName: '安全火炬', zoneId: 'refining', anchor: 'flare', interactive: false },
    { endpointId: 'produced_water_treatment', displayName: '采出水处理', zoneId: 'gathering', anchor: 'water_treatment', interactive: false }
  ];

  function getDevice(objectId) {
    for (var i = 0; i < DEVICES.length; i += 1) if (DEVICES[i].objectId === objectId) return DEVICES[i];
    return null;
  }
  function getZone(zoneId) {
    for (var i = 0; i < ZONES.length; i += 1) if (ZONES[i].zoneId === zoneId) return ZONES[i];
    return null;
  }
  function devicesOfStage(stageIndex) {
    return DEVICES.filter(function (d) { return d.stageIndex === stageIndex; });
  }

  window.PETRO_REGISTRY = {
    version: '1.0.0',
    sceneId: SCENE_ID,
    zones: ZONES,
    cameras: CAMERAS,
    devices: DEVICES,
    routes: ROUTES,
    endpoints: ENDPOINTS,
    getDevice: getDevice,
    getZone: getZone,
    devicesOfStage: devicesOfStage
  };
})();
