document.addEventListener('DOMContentLoaded', () => {
    const workspace = document.getElementById('workspace');
    const canvasContainer = document.getElementById('canvas-container');
    const plansContainer = document.getElementById('plans-container');
    const connectionsLayer = document.getElementById('connections-layer');
    const zoomLevelText = document.getElementById('zoom-level');
    const resetCameraBtn = document.getElementById('reset-camera-btn');
    
    const addPlanBtn = document.getElementById('add-plan-btn');
    const removePlanBtn = document.getElementById('remove-plan-btn');
    const saveProjectBtn = document.getElementById('save-project-btn');
    
    const planModal = document.getElementById('plan-modal');
    const confirmPlanBtn = document.getElementById('confirm-plan-btn');
    const cancelPlanBtn = document.getElementById('cancel-plan-btn');
    const modalTitleText = document.getElementById('modal-title-text');
    const editPlanIdInput = document.getElementById('edit-plan-id');
    const outputsContainer = document.getElementById('outputs-count-container');
    
    let plans = [];
    let connections = [];
    let isRemoving = false;
    let draggingPlan = null;
    let dragOffset = { x: 0, y: 0 };
    
    let connectingNode = null;
    let tempLine = null;

    // --- Camera State ---
    let camera = {
        x: 0,
        y: 0,
        zoom: 1
    };
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    // --- Core Functions ---

    function updateCamera() {
        canvasContainer.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
        
        // Update infinite grid position and scale
        workspace.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
        workspace.style.backgroundSize = `${30 * camera.zoom}px ${30 * camera.zoom}px`;
        
        zoomLevelText.textContent = `${Math.round(camera.zoom * 100)}%`;
    }

    function createPlan(title, banner, desc, outputs, x = 500, y = 500, id = Date.now().toString()) {
        const plan = { id, title, banner, desc, outputs: parseInt(outputs), x, y };
        plans.push(plan);
        renderPlan(plan);
    }

    function renderPlan(plan) {
        const card = document.createElement('div');
        card.className = 'plan-card';
        card.id = `plan-${plan.id}`;
        card.style.left = `${plan.x}px`;
        card.style.top = `${plan.y}px`;

        if (plan.banner) {
            const img = document.createElement('img');
            img.src = plan.banner;
            img.className = 'plan-banner';
            img.onerror = () => img.style.display = 'none';
            card.appendChild(img);
        }

        const content = document.createElement('div');
        content.className = 'plan-content';
        
        const header = document.createElement('div');
        header.className = 'plan-header';

        const title = document.createElement('div');
        title.className = 'plan-title';
        title.textContent = plan.title;
        
        const controls = document.createElement('div');
        controls.className = 'plan-controls';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-icon';
        editBtn.innerHTML = '✎';
        editBtn.onclick = (e) => { e.stopPropagation(); openEditModal(plan); };

        const addNodeBtn = document.createElement('button');
        addNodeBtn.className = 'btn-icon';
        addNodeBtn.innerHTML = '+';
        addNodeBtn.onclick = (e) => { e.stopPropagation(); updateNodesCount(plan.id, 1); };

        const remNodeBtn = document.createElement('button');
        remNodeBtn.className = 'btn-icon';
        remNodeBtn.innerHTML = '-';
        remNodeBtn.onclick = (e) => { e.stopPropagation(); updateNodesCount(plan.id, -1); };

        controls.appendChild(editBtn);
        controls.appendChild(addNodeBtn);
        controls.appendChild(remNodeBtn);
        
        header.appendChild(title);
        header.appendChild(controls);
        content.appendChild(header);
        
        const descDiv = document.createElement('div');
        descDiv.className = 'plan-desc';
        descDiv.textContent = plan.desc;
        
        content.appendChild(descDiv);
        card.appendChild(content);

        const inputNode = document.createElement('div');
        inputNode.className = 'node input-node';
        inputNode.dataset.planId = plan.id;
        inputNode.dataset.type = 'input';
        card.appendChild(inputNode);

        renderNodes(card, plan);

        plansContainer.appendChild(card);
        setupDraggable(card, plan);
        setupNodeEvents(card);
    }

    function renderNodes(card, plan) {
        card.querySelectorAll('.output-node').forEach(n => n.remove());
        const outputsCount = Math.min(Math.max(plan.outputs, 1), 5);
        for (let i = 0; i < outputsCount; i++) {
            const outputNode = document.createElement('div');
            outputNode.className = 'node output-node';
            outputNode.dataset.planId = plan.id;
            outputNode.dataset.type = 'output';
            outputNode.dataset.index = i;
            const topPercent = (100 / (outputsCount + 1)) * (i + 1);
            outputNode.style.top = `${topPercent}%`;
            outputNode.style.transform = 'translateY(-50%)';
            card.appendChild(outputNode);
        }
        setupNodeEvents(card);
    }

    function updateNodesCount(planId, delta) {
        const plan = plans.find(p => p.id === planId);
        if (plan) {
            const newCount = plan.outputs + delta;
            if (newCount >= 1 && newCount <= 5) {
                plan.outputs = newCount;
                const card = document.getElementById(`plan-${planId}`);
                if (card) {
                    if (delta < 0) {
                        connections = connections.filter(conn => {
                            if (conn.fromId === planId && parseInt(conn.fromIndex) >= newCount) {
                                if (conn.element) conn.element.remove();
                                return false;
                            }
                            return true;
                        });
                    }
                    renderNodes(card, plan);
                    updateConnections();
                }
            }
        }
    }

    function setupDraggable(card, plan) {
        card.addEventListener('mousedown', (e) => {
            if (isRemoving) {
                removePlan(plan.id);
                return;
            }
            if (e.button !== 0) return; // Only left click
            if (e.target.closest('.node') || e.target.closest('.plan-controls')) return;

            draggingPlan = { card, plan };
            // Coordinate adjusted for zoom
            dragOffset.x = (e.clientX - workspace.offsetLeft - camera.x) / camera.zoom - plan.x;
            dragOffset.y = (e.clientY - workspace.offsetTop - camera.y) / camera.zoom - plan.y;
            
            card.style.zIndex = 1000;
            e.stopPropagation();
        });
    }

    function setupNodeEvents(card) {
        const nodes = card.querySelectorAll('.node');
        nodes.forEach(node => {
            const newNode = node.cloneNode(true);
            node.parentNode.replaceChild(newNode, node);
            
            newNode.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                if (newNode.dataset.type === 'output') {
                    startConnecting(newNode, e);
                }
            });

            newNode.addEventListener('mouseup', (e) => {
                if (connectingNode && newNode.dataset.type === 'input') {
                    completeConnection(newNode);
                }
            });
        });
    }

    // --- Connection Logic ---

    function startConnecting(node, e) {
        connectingNode = node;
        tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempLine.setAttribute('class', 'connector');
        tempLine.setAttribute('stroke-dasharray', '5,5');
        connectionsLayer.appendChild(tempLine);
        updateTempLine(e);
    }

    function updateTempLine(e) {
        if (!tempLine || !connectingNode) return;
        const startPos = getNodePosition(connectingNode);
        const endPos = { 
            x: (e.clientX - workspace.offsetLeft - camera.x) / camera.zoom, 
            y: (e.clientY - workspace.offsetTop - camera.y) / camera.zoom 
        };
        tempLine.setAttribute('d', calculateSpline(startPos, endPos));
    }

    function completeConnection(inputNode) {
        const outputPlanId = connectingNode.dataset.planId;
        const outputIndex = connectingNode.dataset.index;
        const inputPlanId = inputNode.dataset.planId;

        if (outputPlanId === inputPlanId) {
            stopConnecting();
            return;
        }

        const exists = connections.find(c => 
            c.fromId === outputPlanId && 
            c.fromIndex === outputIndex && 
            c.toId === inputPlanId
        );

        if (!exists) {
            const conn = {
                id: Date.now().toString(),
                fromId: outputPlanId,
                fromIndex: outputIndex,
                toId: inputPlanId,
                element: null
            };
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'connector');
            path.id = `conn-${conn.id}`;
            connectionsLayer.appendChild(path);
            conn.element = path;
            
            connections.push(conn);
            updateConnections();
        }
        
        stopConnecting();
    }

    function stopConnecting() {
        if (tempLine) tempLine.remove();
        tempLine = null;
        connectingNode = null;
    }

    function getNodePosition(node) {
        const rect = node.getBoundingClientRect();
        const containerRect = canvasContainer.getBoundingClientRect();
        return {
            x: (rect.left - containerRect.left) / camera.zoom + rect.width / 2 / camera.zoom,
            y: (rect.top - containerRect.top) / camera.zoom + rect.height / 2 / camera.zoom
        };
    }

    function calculateSpline(start, end) {
        const dx = Math.abs(end.x - start.x) * 0.5;
        return `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
    }

    function updateConnections() {
        connections.forEach(conn => {
            const fromCard = document.getElementById(`plan-${conn.fromId}`);
            const toCard = document.getElementById(`plan-${conn.toId}`);
            
            if (fromCard && toCard) {
                const outputNode = fromCard.querySelector(`.output-node[data-index="${conn.fromIndex}"]`);
                const inputNode = toCard.querySelector('.input-node');
                
                if (outputNode && inputNode) {
                    const start = getNodePosition(outputNode);
                    const end = getNodePosition(inputNode);
                    conn.element.setAttribute('d', calculateSpline(start, end));
                }
            }
        });
    }

    // --- Workspace Events (Zoom & Pan) ---

    workspace.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = -Math.sign(e.deltaY) * 0.1;
        const newZoom = Math.min(Math.max(camera.zoom + delta, 0.2), 3);
        
        // Zoom towards mouse
        const mouseX = e.clientX - workspace.offsetLeft;
        const mouseY = e.clientY - workspace.offsetTop;
        
        const worldX = (mouseX - camera.x) / camera.zoom;
        const worldY = (mouseY - camera.y) / camera.zoom;
        
        camera.zoom = newZoom;
        camera.x = mouseX - worldX * camera.zoom;
        camera.y = mouseY - worldY * camera.zoom;
        
        updateCamera();
    }, { passive: false });

    workspace.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle mouse or Alt + Left
            isPanning = true;
            panStart.x = e.clientX - camera.x;
            panStart.y = e.clientY - camera.y;
            workspace.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            camera.x = e.clientX - panStart.x;
            camera.y = e.clientY - panStart.y;
            updateCamera();
        } else if (draggingPlan) {
            const worldX = (e.clientX - workspace.offsetLeft - camera.x) / camera.zoom;
            const worldY = (e.clientY - workspace.offsetTop - camera.y) / camera.zoom;
            
            const x = worldX - dragOffset.x;
            const y = worldY - dragOffset.y;
            
            draggingPlan.plan.x = x;
            draggingPlan.plan.y = y;
            draggingPlan.card.style.left = `${x}px`;
            draggingPlan.card.style.top = `${y}px`;
            
            updateConnections();
        }
        
        if (tempLine) {
            updateTempLine(e);
        }
    });

    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            workspace.style.cursor = 'default';
        }
        if (draggingPlan) {
            draggingPlan.card.style.zIndex = 2;
            draggingPlan = null;
        }
        if (connectingNode) {
            stopConnecting();
        }
    });

    // --- UI Logic ---

    addPlanBtn.addEventListener('click', () => {
        isRemoving = false;
        removePlanBtn.classList.remove('active');
        openAddModal();
    });

    removePlanBtn.addEventListener('click', () => {
        isRemoving = !isRemoving;
        removePlanBtn.classList.toggle('active', isRemoving);
        document.querySelectorAll('.plan-card').forEach(c => c.classList.toggle('deleting', isRemoving));
    });

    function openAddModal() {
        modalTitleText.textContent = 'Nový Plán';
        editPlanIdInput.value = '';
        document.getElementById('plan-title').value = '';
        document.getElementById('plan-banner').value = '';
        document.getElementById('plan-desc').value = '';
        document.getElementById('plan-outputs').value = 1;
        outputsContainer.style.display = 'block';
        planModal.style.display = 'flex';
    }

    function openEditModal(plan) {
        modalTitleText.textContent = 'Upravit Plán';
        editPlanIdInput.value = plan.id;
        document.getElementById('plan-title').value = plan.title;
        document.getElementById('plan-banner').value = plan.banner;
        document.getElementById('plan-desc').value = plan.desc;
        outputsContainer.style.display = 'none';
        planModal.style.display = 'flex';
    }

    confirmPlanBtn.addEventListener('click', () => {
        const id = editPlanIdInput.value;
        const title = document.getElementById('plan-title').value || 'Bez názvu';
        const banner = document.getElementById('plan-banner').value;
        const desc = document.getElementById('plan-desc').value || 'Bez popisu';
        
        if (id) {
            const plan = plans.find(p => p.id === id);
            if (plan) {
                plan.title = title;
                plan.banner = banner;
                plan.desc = desc;
                
                const card = document.getElementById(`plan-${id}`);
                card.querySelector('.plan-title').textContent = title;
                card.querySelector('.plan-desc').textContent = desc;
                const bannerImg = card.querySelector('.plan-banner');
                if (banner) {
                    if (bannerImg) {
                        bannerImg.src = banner;
                        bannerImg.style.display = 'block';
                    } else {
                        const img = document.createElement('img');
                        img.src = banner;
                        img.className = 'plan-banner';
                        card.prepend(img);
                    }
                } else if (bannerImg) {
                    bannerImg.remove();
                }
            }
        } else {
            const outputs = document.getElementById('plan-outputs').value;
            // Place new plan near camera center
            const centerX = (-camera.x + workspace.offsetWidth / 2) / camera.zoom - 150;
            const centerY = (-camera.y + workspace.offsetHeight / 2) / camera.zoom - 100;
            createPlan(title, banner, desc, outputs, centerX, centerY);
        }
        
        planModal.style.display = 'none';
    });

    cancelPlanBtn.addEventListener('click', () => {
        planModal.style.display = 'none';
    });

    function removePlan(id) {
        plans = plans.filter(p => p.id !== id);
        const card = document.getElementById(`plan-${id}`);
        if (card) card.remove();
        
        connections = connections.filter(conn => {
            if (conn.fromId === id || conn.toId === id) {
                if (conn.element) conn.element.remove();
                return false;
            }
            return true;
        });
    }

    // --- Save / Load (Everything) ---

    saveProjectBtn.addEventListener('click', () => {
        try {
            const projectData = {
                plans: plans,
                connections: connections.map(c => ({
                    fromId: c.fromId,
                    fromIndex: c.fromIndex,
                    toId: c.toId
                })),
                camera: camera
            };
            const serializedData = JSON.stringify(projectData);
            localStorage.setItem('savedProjectFull', serializedData);
            // Also save to a backup key just in case
            localStorage.setItem('savedProjectPaper', serializedData);
            alert('Projekt uložen kompletně (včetně kamery)!');
        } catch (error) {
            console.error('Chyba při ukládání:', error);
            alert('Chyba při ukládání projektu. Zkontrolujte konzoli.');
        }
    });



    resetCameraBtn.addEventListener('click', () => {
        camera = { x: 0, y: 0, zoom: 1 };
        updateCamera();
    });

    // Auto-load on startup
    function autoLoad() {
        const dataStr = localStorage.getItem('savedProjectFull') || localStorage.getItem('savedProjectPaper');
        if (dataStr) {
            const data = JSON.parse(dataStr);
            
            // Reset Workspace
            plansContainer.innerHTML = '';
            connectionsLayer.innerHTML = '';
            plans = [];
            connections = [];
            
            // Restore Camera
            if (data.camera) {
                camera = data.camera;
            } else {
                camera = { x: 0, y: 0, zoom: 1 };
            }
            updateCamera();
            
            // Restore Plans
            data.plans.forEach(p => {
                plans.push(p);
                renderPlan(p);
            });
            
            // Restore Connections
            data.connections.forEach(c => {
                const connId = Date.now().toString() + Math.random();
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('class', 'connector');
                path.id = `conn-${connId}`;
                connectionsLayer.appendChild(path);
                
                connections.push({
                    ...c,
                    id: connId,
                    element: path
                });
            });
            
            setTimeout(updateConnections, 100);
            console.log('Projekt automaticky načten');
        } else {
            // No saved project, create initial setup
            updateCamera();
            createPlan('Kamera a Zoom', '', 'Kolečkem myši přibližujete. Prostředním tlačítkem posouváte plochu.', 2, 100, 150);
        }
    }

    // Auto-save every 5 seconds
    setInterval(() => {
        const projectData = {
            plans: plans,
            connections: connections.map(c => ({
                fromId: c.fromId,
                fromIndex: c.fromIndex,
                toId: c.toId
            })),
            camera: camera
        };
        localStorage.setItem('savedProjectFull', JSON.stringify(projectData));
        localStorage.setItem('savedProjectPaper', JSON.stringify(projectData));
        console.log('Projekt automaticky uložen');
    }, 5000);

    // Initial Setup
    autoLoad();
});
