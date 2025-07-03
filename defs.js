export const CONSTS = {
    
    //最小、最大缩放距离限制
    MIN_CAMERA_DISTANCE: 1,
    MAX_CAMERA_DISTANCE: 1000,
    //交互时画面更新间隔
    UPDATE_INTERVAL: 50,
    //精细度
    SPHERE_SEGS: 64,
    TORUS_SEGS: 128,
    //半径数据
    SUN_RADIUS: 20,
    EARTH_RADIUS: 5,
    MOON_RADIUS: 2,
    //轨道数据
    EARTH_ORBIT_RADIUS: 100,
    MOON_ORBIT_RADIUS: 12,
    ORBIT_WIDTH: 0.2, 
    //自转数据
    SUN_ROTATION: 0.001,
    EARTH_ROTATION: 0.01,
    MOON_ROTATION: 0.001,
    //公转数据
    EARTH_REVOLUTION: 0.002,
    MOON_REVOLUTION: 0.005,
};

export let CONFIGS = {
    //是否开启自转、公转
    isRotation: true,
    isRevolution: true,
    //自转/公转的速度控制
    speed: 1,
}