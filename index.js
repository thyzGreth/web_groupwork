// 监听方向变化并在竖屏时给出提示
if (window.matchMedia("(orientation: portrait)").matches) {
    alert("为了获得更好的体验，请切换到横屏模式！");
}

import { CONSTS, CONFIGS } from './defs.js';
let currentCamera, verticalCamera, horizontalCamera, freeCamera, pipCamera;//相机
let scene, renderer, canvas;//场景、渲染器、画布
let pipCanvas, pipRenderer;//画中画相关
let objects = [];//交互相关
let sun, earth, moon;//星球相关
let controls;//控制相关
let focusedObject;//聚焦物体
let raycaster = new THREE.Raycaster();
let pointer = new THREE.Vector2();
let originalTarget = new THREE.Vector3(); // 原始目标：原点
let cameraOffset = new THREE.Vector3();
let isUserInteracting = false;
let lastUpdateTime = 0;
let currentTexture;
let currentEclipse = "";
let cameraLerpTarget = null; //相机动画的目标对象       
let cameraLerpProgress = 0;
let cameraLerpDuration = 0.7;
let cameraLerpStartTime = 0;
let cameraLerpFrom = null; //用于插值动画的起点         
let initialCameraPosition, initialCameraTarget; //初始自由相机与target

//地球自转
const tilt = THREE.MathUtils.degToRad(23.4);
const earthAxis = new THREE.Vector3(Math.sin(tilt), 0, Math.cos(tilt)).normalize();

function initCamera() {
    //相机参数
    const fov = 75; //摄像机的广角(角度制，Three.js其他部分都是弧度制)
    const aspect = (window.innerWidth / window.innerHeight);  // 宽高比
    const near = 0.1; //可绘区域的近点
    const far = 1000; //可绘区域的远点
    //自由相机的初始化
    freeCamera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    freeCamera.position.set(0, 0, 150);
    //垂直相机的初始化
    verticalCamera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    verticalCamera.position.set(0, 150, 0);
    verticalCamera.up.set(0, 0, 1);
    verticalCamera.lookAt(0, 0, 0);
    //水平相机的初始化
    horizontalCamera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    horizontalCamera.position.set(0, 0, 150);
    //画中画相机的初始化
    pipCamera = new THREE.PerspectiveCamera(45, aspect, near, far)
    currentCamera = freeCamera;
    //刚进入页面的初始状态
    initialCameraPosition = freeCamera.position.clone();
    initialCameraTarget = new THREE.Vector3(0, 0, 0); // 默认target为原点
}

function initScene() {//场景的初始化
    scene = new THREE.Scene();
    //主渲染器的初始化
    canvas = document.querySelector('#canvas-main');
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // 需要开启阴影，不然没法显示日/月食
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    //画中画渲染器的初始化
    pipCanvas = document.querySelector('#canvas-pip');
    pipRenderer = new THREE.WebGLRenderer({ antialias: true, canvas: pipCanvas });
    pipRenderer.setSize(window.innerWidth / 4, window.innerHeight / 4);
    pipRenderer.shadowMap.enabled = true; // 需要开启阴影，不然没法显示日/月食
    //2.添加光源：以太阳为中心的点光源
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);//光照的颜色和亮度
    pointLight.castShadow = true; // 光源投射阴影
    pointLight.shadow.bias = -0.004; // 减少阴影失真
    pointLight.shadow.mapSize.width = 4096; // 提高阴影质量
    pointLight.shadow.mapSize.height = 4096;
    scene.add(pointLight);
}

// 更新公转按钮文本
function updateRevolutionButtonText() {
    const revolutionButton = document.getElementById("button-revolution");
    revolutionButton.textContent = CONFIGS.isRevolution ? "停止公转" : "开启公转";
}

function init() {
    //1.初始化操作；包括场景渲染器的初始化
    initScene();
    //2.相机的初始化
    initCamera();
    //3.添加地球、太阳、月球
    const textureLoader = new THREE.TextureLoader();
    //添加太阳
    const sunGeometry = new THREE.SphereGeometry(CONSTS.SUN_RADIUS, CONSTS.SPHERE_SEGS, CONSTS.SPHERE_SEGS);
    const sunTexture = textureLoader.load('./texture/sun.jpg');
    const sunMaterial = new THREE.MeshBasicMaterial({ map: sunTexture });
    sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.name = "太阳";
    scene.add(sun);//太阳直接位于正中间
    //添加地球
    const earthGeometry = new THREE.SphereGeometry(CONSTS.EARTH_RADIUS, CONSTS.SPHERE_SEGS, CONSTS.SPHERE_SEGS); //几何体：球体，参数为半径、经度分段、纬度分段 
    const earthTexture = textureLoader.load('./texture/earth.jpg');  //加载材质     
    const earthMaterial = new THREE.MeshPhongMaterial({ map: earthTexture }); //设置材质和放射颜色
    earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earth.castShadow = true; // 地球投射阴影
    earth.receiveShadow = true; // 地球接收阴影
    earth.name = "地球";

    // 创建地轴容器和自转容器
    const earthAxisContainer = new THREE.Object3D(); // 用于保持地轴方向
    const earthRotation = new THREE.Object3D(); // 用于地球自转

    // 调整地轴方向
    const yAxis = new THREE.Vector3(0, -1, 0);
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(yAxis, earthAxis);
    earthRotation.quaternion.copy(alignQuat);
    earthRotation.add(earth);

    // 将地轴容器添加到场景
    earthAxisContainer.add(earthRotation);

    //添加地球轨道(用于公转操作)
    const earthOrbitGeometry =
        new THREE.TorusGeometry(CONSTS.EARTH_ORBIT_RADIUS, CONSTS.ORBIT_WIDTH, CONSTS.TORUS_SEGS, CONSTS.TORUS_SEGS);
    const OrbitMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.2 });
    const earthOrbit = new THREE.Mesh(earthOrbitGeometry, OrbitMaterial);
    earthOrbit.rotation.x = Math.PI / 2;
    scene.add(earthOrbit);
    //添加地月系统(需要保证地球公转和自转相互不干扰，必须设置这样的系统)
    const earthSystem = new THREE.Object3D();
    earthOrbit.add(earthSystem);
    earthSystem.position.x = CONSTS.EARTH_ORBIT_RADIUS;
    earthSystem.add(earthAxisContainer); // 将地轴容器添加到地月系统

    //添加月球轨道
    const moonOrbitGeometry =
        new THREE.TorusGeometry(CONSTS.MOON_ORBIT_RADIUS, CONSTS.ORBIT_WIDTH, CONSTS.TORUS_SEGS, CONSTS.TORUS_SEGS);
    const moonOrbit = new THREE.Mesh(moonOrbitGeometry, OrbitMaterial);
    moonOrbit.rotation.z = Math.PI / 2; // 关键修改：绕X轴旋转90度
    earthSystem.add(moonOrbit);
    //添加月球
    const moonGeometry = new THREE.SphereGeometry(CONSTS.MOON_RADIUS, CONSTS.SPHERE_SEGS, CONSTS.SPHERE_SEGS);
    const moonTexture = textureLoader.load('./texture/moon.jpg');
    const moonMaterial = new THREE.MeshPhongMaterial({ map: moonTexture }); //材质  
    moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.castShadow = true; // 月球投射阴影
    moon.receiveShadow = true; // 月球接收阴影
    moon.name = "月球";
    moon.position.x = CONSTS.MOON_ORBIT_RADIUS;//月球相对月球轨道中心的偏移
    moonOrbit.add(moon);
    //添加星体到Objects里
    objects.push(sun, earth, moon);

    //4.动画效果：包括公转、自转等
    function render() {
        const now = Date.now();
        scene.updateMatrixWorld(true);
        //处理聚焦物体与动画过渡
        if (cameraLerpTarget) {
            // t为进度
            let t = (Date.now() - cameraLerpStartTime) / (cameraLerpDuration * 1000);
            if (t > 1) t = 1;
            cameraLerpProgress = t;

            // 计算实时目标
            let realTarget, realCameraEnd;
            if (cameraLerpTarget.isFollow && focusedObject) {
                // 目标和终点要实时读取
                realTarget = new THREE.Vector3();
                focusedObject.getWorldPosition(realTarget);
                //保持与目标天体的相对offset不变，计算相机最终应该到达的位置
                realCameraEnd = realTarget.clone().add(cameraLerpTarget.offset);
            } else {
                //取消聚焦时使用静态目标参数
                realTarget = cameraLerpTarget.target;
                realCameraEnd = cameraLerpTarget.position;
            }

            // 插值实现平滑过渡
            currentCamera.position.lerpVectors(cameraLerpFrom.position, realCameraEnd, t);
            controls.target.lerpVectors(cameraLerpFrom.target, realTarget, t);

            // 动画完成
            if (t >= 1) {
                currentCamera.position.copy(realCameraEnd);
                controls.target.copy(realTarget);
                cameraLerpTarget = null;
                cameraLerpFrom = null;
            }
        } else if (focusedObject) {
            // 没有动画时，持续跟随天体
            const focusedPosition = new THREE.Vector3();
            focusedObject.getWorldPosition(focusedPosition);
            controls.target.copy(focusedPosition);
            //刷新天体位置
            if (!isUserInteracting || Date.now() - lastUpdateTime > CONSTS.UPDATE_INTERVAL) {
                cameraOffset = currentCamera.position.clone().sub(focusedPosition);
                lastUpdateTime = Date.now();
            }
            currentCamera.position.copy(focusedPosition).add(cameraOffset);
        }
        //最后还需要update
        controls.update();
        //处理自转
        if (CONFIGS.isRotation) {
            sun.rotation.y += CONSTS.SUN_ROTATION * CONFIGS.speed;
            // 地球自转（绕自身轴）
            earthRotation.rotation.y += CONSTS.EARTH_ROTATION * CONFIGS.speed;
            moon.rotation.z += CONSTS.MOON_ROTATION * CONFIGS.speed;
        }
        //处理公转
        if (CONFIGS.isRevolution) {
            earthOrbit.rotation.z += CONSTS.EARTH_REVOLUTION * CONFIGS.speed;
            // 地轴反向旋转以保持空间指向
            earthAxisContainer.rotation.z -= CONSTS.EARTH_REVOLUTION * CONFIGS.speed;
            moonOrbit.rotation.z += CONSTS.MOON_REVOLUTION * CONFIGS.speed;
        }
        //处理阴影
        scene.traverse(function (object) {
            if (object.material) {
                object.material.needsUpdate = true;
            }
        });
        renderer.render(scene, currentCamera);//每次更新页面都要刷新显示
        //处理日食、月食
        if (currentEclipse !== "") {
            if (currentEclipse.startsWith("lunar"))//如果是月食：需要调整相机跟随地球，并锁定月亮
            {
                const earthWorldPosition = new THREE.Vector3();
                const moonWorldPosition = new THREE.Vector3();
                earth.getWorldPosition(earthWorldPosition);
                moon.getWorldPosition(moonWorldPosition);
                pipCamera.position.set(earthWorldPosition.x, earthWorldPosition.y, earthWorldPosition.z);
                pipCamera.lookAt(moonWorldPosition);
            }
            pipRenderer.render(scene, pipCamera);
        }
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

    // 5. 添加交互控制（鼠标拖拽缩放）
    controls = new THREE.OrbitControls(currentCamera, renderer.domElement);
    controls.enableDamping = true; // 启用阻尼感
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.3;
    controls.zoomSpeed = 0.5;
    // 6. 添加其它函数
    //鼠标点击：判断是否和星球相交，如果相交触发事件
    function onMouseClick(event) {
        if (currentCamera !== freeCamera) { //只有自由视角时才能选中
            return;
        }
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(pointer, currentCamera);
        const intersects = raycaster.intersectObjects(objects);
        if (intersects.length > 0) {//如果有点击到物体，只取第一个点击到的
            onIntersect(intersects[0].object);
        }
    }
    //点击到星球：进行聚焦，并弹出换肤界面
    function onIntersect(object) {
        console.log("onIntersect");
        //如果点击的是当前聚焦的对象：取消聚焦，恢复原本的聚焦目标
        if (focusedObject === object) {
            // 用动画返回
            resetFocus();
        }
        else {
            // 聚焦新天体
            const objectPosition = new THREE.Vector3();
            object.getWorldPosition(objectPosition);
            // offset：当前相机与天体之间的相对位置
            const offset = currentCamera.position.clone().sub(objectPosition);
            //动画起点
            cameraLerpFrom = {
                position: currentCamera.position.clone(),
                target: controls.target.clone(),
            };
            //终点始终跟随天体
            cameraLerpTarget = {
                isFollow: true,
                offset: offset.clone()
            };
            cameraLerpStartTime = Date.now();
            cameraLerpProgress = 0;

            focusedObject = object;
            updatePlanetName(object.name);
        }
    }
    //显示当前星球的名字 
    function updatePlanetName(name) {
        document.querySelector("#focused_name").textContent = name;
    }
    //控制器变化时，视角也要变化
    function onControlsChange() {
        if (focusedObject) {
            isUserInteracting = true;
            // 更新偏移向量
            const focusedPosition = new THREE.Vector3();
            focusedObject.getWorldPosition(focusedPosition);
            cameraOffset = currentCamera.position.clone().sub(focusedPosition);
            //缩放距离限制：不能过近也不能过远
            const dist = cameraOffset.length();
            if (dist < CONSTS.MIN_CAMERA_DISTANCE) {
                cameraOffset.normalize().multiplyScalar(CONSTS.MIN_CAMERA_DISTANCE); //过近，限制为最近距离
                currentCamera.position.copy(focusedPosition).add(cameraOffset);
            }
            else if (dist > CONSTS.MAX_CAMERA_DISTANCE) {
                cameraOffset.normalize().multiplyScalar(CONSTS.MAX_CAMERA_DISTANCE); //过远，限制为最远距离
                currentCamera.position.copy(focusedPosition).add(cameraOffset);
            }
        }
    }
    function onControlsEnd() {
        isUserInteracting = false;
    }
    //页面大小改变时：重新设置大小
    function onWindowResize() {
        currentCamera.aspect = window.innerWidth / window.innerHeight;
        currentCamera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
    //按下按钮切换为俯视图
    function onVerticalCameraButtonClick() {
        currentCamera = verticalCamera;
        currentCamera.aspect = window.innerWidth / window.innerHeight;
        currentCamera.updateProjectionMatrix();
        resetFocusForVertical();
    }
    //按下按钮切换为侧视图
    function onHorizontalCameraButtonClick() {
        currentCamera = horizontalCamera;
        currentCamera.aspect = window.innerWidth / window.innerHeight;
        currentCamera.updateProjectionMatrix();
        resetFocus();
    }
    //按下按钮切换为自由视角
    function onFreeCameraButtonClick() {
        currentCamera = freeCamera;
        currentCamera.aspect = window.innerWidth / window.innerHeight;
        currentCamera.updateProjectionMatrix();
        resetFocusForFree();
    }
    //重置聚焦状态的函数
    function resetFocus() {
        //保存当前相机的位置和target，作为动画起点
        cameraLerpFrom = {
            position: currentCamera.position.clone(),
            target: controls.target.clone(),
        };
        //初始相机位置与target
        cameraLerpTarget = {
            isFollow: false,
            position: initialCameraPosition.clone(),
            target: initialCameraTarget.clone()
        };
        cameraLerpStartTime = Date.now();
        cameraLerpProgress = 0;

        focusedObject = null;
        updatePlanetName("无");
    }
    function resetFocusForVertical() {
        // 俯视相机初始位置和目标
        const verticalPosition = new THREE.Vector3(0, 150, 0);  // y轴正方向
        const verticalTarget = new THREE.Vector3(0, 0, 0);

        // 设置相机位置和up
        verticalCamera.position.copy(verticalPosition);
        verticalCamera.up.set(0, 0, 1);
        verticalCamera.lookAt(verticalTarget);

        // 更新controls
        controls.object = verticalCamera;
        controls.target.copy(verticalTarget);
        controls.update();

        // 清除聚焦对象
        focusedObject = null;
        updatePlanetName("无");
    }
    function resetFocusForFree() {
        // 自由视角初始位置、up、目标
        const freePosition = new THREE.Vector3(0, 0, 150);
        const freeTarget = new THREE.Vector3(0, 0, 0);

        freeCamera.position.copy(freePosition);
        freeCamera.up.set(0, 1, 0);  // three.js默认up
        freeCamera.lookAt(freeTarget);

        controls.object = freeCamera;
        controls.target.copy(freeTarget);
        controls.update();

        focusedObject = null;
        updatePlanetName("无");
    }

    //自转按钮：开启/暂停自转
    function onRotationButtonClick() {
        if (CONFIGS.isRotation == true) {
            CONFIGS.isRotation = false;
        }
        else {
            CONFIGS.isRotation = true;
        }
        // 更新自转按钮文本
        const rotationButton = document.getElementById("button-rotation");
        rotationButton.textContent = CONFIGS.isRotation ? "停止自转" : "开启自转";
    }
    //公转按钮：开启/暂停公转
    function onRevolutionButtonClick() {
        if (CONFIGS.isRevolution == true) {
            CONFIGS.isRevolution = false;
        }
        else {
            CONFIGS.isRevolution = true;
        }
        updateRevolutionButtonText(); // 更新按钮文本
    }
    //速度控制滑动条：控制自转、公转的运动速度
    function onSpeedRangeChange() {
        const speedRange = document.querySelector("#range-speed");
        CONFIGS.speed = Math.pow(10, speedRange.value);//设置speed
        const label = document.querySelector('label[for="range-speed"]');
        label.textContent = "速度控制：×" + CONFIGS.speed;
    }
    //从本地选择材质的按钮
    function onSkinFileChange(event) {
        //只选择第一个文件
        const file = event.target.files[0];
        if (!file) return;
        //检验是否是图片
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
        const fileExtension = file.name.split('.').pop().toLowerCase();
        if (!imageExtensions.includes(fileExtension)) {
            alert("文件不是图片类型！");
            return;
        }
        currentTexture = URL.createObjectURL(file);
    }
    //将当前材质运用到当前星球
    function onSkinChangeButtonClick() {
        if (!focusedObject) {
            return;
        }
        if (!currentTexture) {
            alert("请选择图片");
            return;
        }
        //加载currentTexture到focusedObject的材质
        const texture = textureLoader.load(currentTexture);
        const newMaterial = new THREE.MeshPhongMaterial({ map: texture });
        focusedObject.material = newMaterial;
    }
    //日食控制（通过设置相机远近实现不同天相）
    function SolarEclipse(pipCamera_x, pipCamera_y, pipCamera_z, state) {
        if (currentEclipse === state) { //如果当前正在日食：取消日食
            pipCanvas.style.display = "none";
            currentEclipse = "";
            CONFIGS.isRevolution = true;
            updateRevolutionButtonText(); // 更新按钮文本
            return;
        }//否则，开启日食
        pipCanvas.style.display = "block";
        currentEclipse = state;
        CONFIGS.isRevolution = false;
        updateRevolutionButtonText(); // 更新按钮文本
        //日-月-地位置成一条线
        earthOrbit.rotation.set(Math.PI / 2, 0, 0);
        earthSystem.position.set(CONSTS.EARTH_ORBIT_RADIUS, 0, 0);
        moonOrbit.rotation.set(0, 0, Math.PI / 2);
        moon.position.set(0, CONSTS.MOON_ORBIT_RADIUS, 0);
        //相机设置：地球看向太阳
        pipCamera.position.set(pipCamera_x, pipCamera_y, pipCamera_z);
        pipCamera.lookAt(0, 0, 0);
    }
    //日全食按钮
    function onSolarEclipseTotalButtonClick() {
        SolarEclipse(CONSTS.EARTH_ORBIT_RADIUS - 3, 0, 0, "solar_eclipse_total");
    }
    //日环食
    function onSolarEclipseAnnularButtonClick() {
        SolarEclipse(CONSTS.EARTH_ORBIT_RADIUS - 1, 0, 0, "solar_eclipse_annular");
    }
    //日偏食按钮
    function onSolarEclipsePartialButtonClick() {
        SolarEclipse(CONSTS.EARTH_ORBIT_RADIUS - 1, 0, 2, "solar_eclipse_partial");
    }
    //月食控制（
    function LunarEclipse(pipCamera_x, pipCamera_y, pipCamera_z, state, moon_x, moon_y, moon_z) { //月食的处理比较特殊：需要添加平行光模拟太阳光线，
        if (currentEclipse === state) { //如果当前正在月食：取消月食
            pipCanvas.style.display = "none";
            currentEclipse = "";
            CONFIGS.isRevolution = true;
            updateRevolutionButtonText(); // 更新按钮文本
            return;
        }//否则，开启月食
        pipCanvas.style.display = "block";
        currentEclipse = state;
        CONFIGS.isRevolution = false;
        updateRevolutionButtonText(); // 更新按钮文本
        //日-地-月位置成一条线
        earthOrbit.rotation.set(Math.PI / 2, 0, 0);
        earthSystem.position.set(CONSTS.EARTH_ORBIT_RADIUS, 0, 0);
        moonOrbit.rotation.set(0, 0, Math.PI / 2);
        moon.position.set(moon_x, moon_y, moon_z);
        //获取月球的世界坐标
        const moonWorldPosition = new THREE.Vector3();
        moon.getWorldPosition(moonWorldPosition);
        //相机设置：地球看向月球
        pipCamera.position.set(pipCamera_x, pipCamera_y, pipCamera_z);
        pipCamera.lookAt(moonWorldPosition);
        // 提高阴影质量（月食时特别重要）
        renderer.shadowMap.needsUpdate = true;
        pipRenderer.shadowMap.needsUpdate = true;
    }
    //月全食按钮
    function onLunarEclipseTotalButtonClick() {
        LunarEclipse(CONSTS.EARTH_ORBIT_RADIUS, 0, 0, "lunar_eclipse_total", 0, - CONSTS.MOON_ORBIT_RADIUS, 0);
    }
    //月偏食按钮
    function onLunarEclipsePartialButtonClick() {
        LunarEclipse(CONSTS.EARTH_ORBIT_RADIUS, 0, 1, "lunar_eclipse_partial", - CONSTS.MOON_ORBIT_RADIUS / 2, - CONSTS.MOON_ORBIT_RADIUS / Math.sqrt(4 / 3), 0);
    }
    //初始化按钮控制
    function initButtonControls() {
        // ---- 视图控制按钮：互斥激活 ----
        const viewButtons = [
            document.getElementById("button-vertical_camera"),
            document.getElementById("button-horizontal_camera"),
            document.getElementById("button-free_camera")
        ];

        viewButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                viewButtons.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
            });
        });

        // ---- 日食控制按钮：互斥激活 ----
        const eclipseButtons = [
            document.getElementById("button-solar_eclipse_total"),
            document.getElementById("button-solar_eclipse_annular"),
            document.getElementById("button-solar_eclipse_partial"),
            document.getElementById("button-lunar_eclipse_total"),
            document.getElementById("button-lunar_eclipse_partial")
        ];

        eclipseButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.classList.contains("active")) {
                    eclipseButtons.forEach(b => b.classList.remove("active"));
                } else {
                    eclipseButtons.forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                }
            });
        });

        // 初始化按钮文本
        updateRevolutionButtonText();
        const rotationButton = document.getElementById("button-rotation");
        rotationButton.textContent = CONFIGS.isRotation ? "停止自转" : "开启自转";
    }

    // 7. 添加事件控制
    document.addEventListener('DOMContentLoaded', function () { //绑定一些按钮

        window.addEventListener('resize', onWindowResize);

        document.querySelector("#button-vertical_camera").addEventListener('click', onVerticalCameraButtonClick);

        document.querySelector("#button-horizontal_camera").addEventListener('click', onHorizontalCameraButtonClick);

        document.querySelector("#button-free_camera").addEventListener('click', onFreeCameraButtonClick);

        document.querySelector("#button-rotation").addEventListener('click', onRotationButtonClick);

        document.querySelector("#button-revolution").addEventListener('click', onRevolutionButtonClick);

        document.querySelector("#range-speed").addEventListener('change', onSpeedRangeChange);

        document.querySelector("#file-skin").addEventListener('change', onSkinFileChange);

        document.querySelector("#button-skin_change").addEventListener('click', onSkinChangeButtonClick);

        document.querySelector("#button-solar_eclipse_total").addEventListener('click', onSolarEclipseTotalButtonClick);

        document.querySelector("#button-solar_eclipse_annular").addEventListener('click', onSolarEclipseAnnularButtonClick);

        document.querySelector("#button-solar_eclipse_partial").addEventListener('click', onSolarEclipsePartialButtonClick);

        document.querySelector("#button-lunar_eclipse_total").addEventListener('click', onLunarEclipseTotalButtonClick);

        document.querySelector("#button-lunar_eclipse_partial").addEventListener('click', onLunarEclipsePartialButtonClick);

        document.addEventListener('click', onMouseClick);

        controls.addEventListener('change', onControlsChange);

        controls.addEventListener('end', onControlsEnd);

        initButtonControls();
    })
}

init();