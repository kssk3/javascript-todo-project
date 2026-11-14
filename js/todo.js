(() => {
    "use strict";

    /* =====================================================================
     * 1. 상수
     * ===================================================================== */
    const STORAGE_KEY = "todo-list";
    const MAX_LENGTH = 100;

    // 필터 이름 -> 조건 함수. 새 필터가 필요하면 여기에 한 줄만 추가하면 된다.
    const FILTERS = {
        all: () => true,
        active: (todo) => !todo.done,
        done: (todo) => todo.done,
    };

    // 목록이 비었을 때 보여줄 문구 (줄바꿈은 CSS whitespace-pre-line 이 처리)
    const EMPTY_MESSAGES = {
        all: "아직 할 일이 없어요\n위에서 첫 할 일을 추가해 보세요.",
        active: "진행 중인 할 일이 없어요\n모두 끝냈거나 아직 추가하지 않았어요.",
        done: "완료한 할 일이 없어요\n할 일을 체크하면 여기에 모여요.",
    };

    // 아이콘 SVG path (24x24 기준)
    const ICON_PATHS = {
        close: "M6 6l12 12M18 6L6 18",
        edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4",
    };

    /* =====================================================================
     * 2. 데이터 로직 (순수 함수)
     *    - DOM을 전혀 모르고, 원본 배열을 바꾸지 않고 "새 배열"을 돌려준다.
     *    - 입력이 같으면 결과가 같으므로 테스트·재사용이 쉽다.
     * ===================================================================== */
    const createId = () =>
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const createTodo = (text) => ({ id: createId(), text, done: false });

    const toggleTodo = (list, id) =>
        list.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));

    const updateTodoText = (list, id, text) =>
        list.map((todo) => (todo.id === id ? { ...todo, text } : todo));

    const removeTodo = (list, id) => list.filter((todo) => todo.id !== id);

    const removeDoneTodos = (list) => list.filter((todo) => !todo.done);

    // reduce 로 완료 개수를 한 번에 집계 → 진행률(%)까지 계산
    const getStats = (list) => {
        const total = list.length;
        const done = list.reduce((count, todo) => count + (todo.done ? 1 : 0), 0);
        const percent = total === 0 ? 0 : Math.round((done / total) * 100);
        return { total, done, percent };
    };

    // 저장된 값이 깨져 있어도 앱이 죽지 않도록 모양을 검증·정규화한다.
    // (이전 버전은 id 를 숫자로 저장했으므로 String() 으로 맞춰 호환)
    const parseTodos = (raw) => {
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((item) => item && item.id != null && typeof item.text === "string")
                .map((item) => ({
                    id: String(item.id),
                    text: item.text,
                    done: Boolean(item.done),
                }));
        } catch {
            return [];
        }
    };

    const loadTodos = () => {
        try {
            return parseTodos(localStorage.getItem(STORAGE_KEY));
        } catch {
            return []; // 저장소 접근 자체가 막힌 환경(시크릿 모드 등)
        }
    };

    const saveTodos = (list) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch {
            // 용량 초과 등으로 저장에 실패해도 화면 동작은 계속된다.
        }
    };

    /* =====================================================================
     * 3. 화면 상태
     * ===================================================================== */
    let todos = loadTodos();
    let filter = "all"; // 현재 조회 필터
    let editingId = null; // 수정 중인 항목 id (없으면 null)
    let newId = null; // 방금 추가된 항목 id (등장 애니메이션용)

    /* =====================================================================
     * 4. DOM 참조
     * ===================================================================== */
    const $ = (selector) => document.querySelector(selector);

    const todoForm = $("#todoForm");
    const todoInput = $("#todoInput");
    const addButton = $("#addButton");
    const todoList = $("#todoList");
    const filterBar = $("#filterBar");
    const emptyMessage = $("#empty-message");
    const clearButton = $("#clearButton");
    const todayText = $("#todayText");
    const progressText = $("#progressText");
    const progressBar = $("#progressbar");
    const progressFill = $("#progressFill");

    /* =====================================================================
     * 5. DOM 생성 헬퍼
     * ===================================================================== */
    const SVG_NS = "http://www.w3.org/2000/svg";

    const createIcon = (pathData) => {
        const svg = document.createElementNS(SVG_NS, "svg");
        const attrs = {
            width: "20",
            height: "20",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2.2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "aria-hidden": "true",
        };
        Object.entries(attrs).forEach(([name, value]) => svg.setAttribute(name, value));

        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", pathData);
        svg.append(path);
        return svg;
    };

    const createIconButton = ({ label, className, iconPath }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.className = `${className} button-press flex size-9 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-50`;
        button.append(createIcon(iconPath));
        return button;
    };

    const createCheckbox = (todo) => {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = todo.done;
        checkbox.setAttribute("aria-label", `${todo.text} 완료 체크`);
        checkbox.className = "todo-check size-5 shrink-0 cursor-pointer accent-blue-400";
        return checkbox;
    };

    const createTextView = (todo) => {
        const text = document.createElement("span");
        text.textContent = todo.text; // textContent 사용 → HTML 이 해석되지 않아 XSS 안전
        text.title = "더블클릭해서 수정";
        text.className = `todo-text min-w-0 flex-1 break-words text-[17px] ${
            todo.done ? "text-gray-400 line-through" : "text-gray-800"
        }`;
        return text;
    };

    const createEditInput = (todo) => {
        const input = document.createElement("input");
        input.type = "text";
        input.value = todo.text;
        input.maxLength = MAX_LENGTH;
        input.setAttribute("aria-label", "할 일 수정");
        input.className =
            "todo-edit min-w-0 flex-1 rounded-lg bg-white px-2 py-1 text-[17px] outline-none ring-2 ring-blue-500";
        return input;
    };

    const createTodoElement = (todo) => {
        const li = document.createElement("li");
        li.dataset.id = todo.id; // 이벤트 위임에서 "몇 번 할 일인지" 찾을 때 사용
        li.className = "flex items-center gap-2 rounded-xl px-4 py-2 hover:bg-gray-100";
        if (todo.id === newId) li.classList.add("is-new");

        li.append(createCheckbox(todo));

        if (todo.id === editingId) {
            li.append(createEditInput(todo));
            return li;
        }

        li.append(
            createTextView(todo),
            createIconButton({
                label: "수정",
                className: "todo-edit-btn hover:text-blue-500",
                iconPath: ICON_PATHS.edit,
            }),
            createIconButton({
                label: "삭제",
                className: "todo-delete hover:text-red-500",
                iconPath: ICON_PATHS.close,
            }),
        );
        return li;
    };

    /* =====================================================================
     * 6. 렌더링
     * ===================================================================== */
    const render = () => {
        // 조회: 현재 필터 조건을 통과한 항목만 화면에 그린다.
        const visibleTodos = todos.filter(FILTERS[filter]);

        // 목록 전체를 한 번에 교체 → 항목마다 appendChild 하지 않아 리플로우가 1회로 줄어든다.
        todoList.replaceChildren(...visibleTodos.map(createTodoElement));
        newId = null; // 애니메이션은 추가된 직후 1회만

        const { total, done, percent } = getStats(todos);
        progressText.textContent = `${total}개 중 ${done}개 완료`;
        progressFill.style.width = `${percent}%`;
        progressBar.setAttribute("aria-valuenow", String(percent));

        filterBar.querySelectorAll("[data-filter]").forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
        });

        // 전체가 비었으면 항상 "첫 할 일" 문구, 아니면 현재 필터에 맞는 문구
        emptyMessage.textContent = EMPTY_MESSAGES[total === 0 ? "all" : filter];
        emptyMessage.hidden = visibleTodos.length > 0;
        clearButton.hidden = done === 0;

        focusEditInput();
    };

    // 항목 1개만 새로 그려 제자리에서 교체한다.
    // 수정 시작/종료처럼 "그 항목만 바뀌는" 동작에서 목록 전체를 다시 만들지 않기 위함.
    // (전체를 다시 만들면 blur 직후 사용자가 누르던 다른 버튼이 사라져 클릭이 유실된다)
    const renderItem = (id) => {
        const li = todoList.querySelector(`li[data-id="${CSS.escape(id)}"]`);
        const todo = todos.find((item) => item.id === id);
        if (li && todo) li.replaceWith(createTodoElement(todo));
    };

    // 수정창이 화면에 있으면 포커스를 주고 내용을 전체 선택
    function focusEditInput() {
        const editInput = todoList.querySelector(".todo-edit");
        if (!editInput) return;
        editInput.focus();
        editInput.select();
    }

    // 데이터를 바꾸는 모든 동작의 단일 통로: 상태 갱신 → 저장 → 다시 그리기
    const commit = (nextTodos) => {
        todos = nextTodos;
        saveTodos(todos);
        render();
    };

    /* =====================================================================
     * 7. 동작 (이벤트 핸들러가 호출)
     * ===================================================================== */
    const getTodoId = (element) => element.closest("li")?.dataset.id;

    const addTodo = (text) => {
        const todo = createTodo(text);
        newId = todo.id;
        // '완료' 필터를 보고 있으면 방금 추가한 항목이 안 보이므로 전체로 전환
        if (filter === "done") filter = "all";
        commit([...todos, todo]);
    };

    const startEdit = (id) => {
        editingId = id;
        renderItem(id);
        focusEditInput();
    };

    const cancelEdit = () => {
        const id = editingId;
        editingId = null;
        renderItem(id);
    };

    const finishEdit = (id, rawText) => {
        if (editingId !== id) return; // Enter 후 blur 가 또 들어오는 중복 호출 방어
        editingId = null;

        const text = rawText.trim();
        const original = todos.find((todo) => todo.id === id);

        // 빈 값이거나 바뀐 게 없으면 저장하지 않고 원래 모습으로만 되돌린다.
        if (text !== "" && original && text !== original.text) {
            todos = updateTodoText(todos, id, text);
            saveTodos(todos);
        }
        renderItem(id);
    };

    const updateAddButton = () => {
        addButton.disabled = todoInput.value.trim() === "";
    };

    /* =====================================================================
     * 8. 이벤트 연결
     *    목록 안의 요소(체크박스·버튼·수정창)는 매번 새로 만들어지므로
     *    li 마다 리스너를 달지 않고 부모 ul 하나에서 이벤트 위임으로 처리한다.
     *    → 리스너 개수가 항목 수와 무관하게 고정, 새 항목도 자동으로 동작.
     * ===================================================================== */
    todoInput.addEventListener("input", updateAddButton);

    todoForm.addEventListener("submit", (event) => {
        event.preventDefault(); // form 의 기본 동작(새로고침) 막기

        const text = todoInput.value.trim();
        if (text === "") return;

        addTodo(text);
        todoInput.value = "";
        updateAddButton();
        todoInput.focus(); // 바로 다음 할 일을 입력할 수 있게
    });

    filterBar.addEventListener("click", (event) => {
        const button = event.target.closest("[data-filter]");
        if (!button || !(button.dataset.filter in FILTERS)) return;

        filter = button.dataset.filter;
        editingId = null;
        render();
    });

    // 완료 체크
    todoList.addEventListener("change", (event) => {
        if (!event.target.classList.contains("todo-check")) return;
        commit(toggleTodo(todos, getTodoId(event.target)));
    });

    // 수정·삭제 버튼
    todoList.addEventListener("click", (event) => {
        const id = getTodoId(event.target);
        if (!id) return;

        if (event.target.closest(".todo-delete")) {
            commit(removeTodo(todos, id));
        } else if (event.target.closest(".todo-edit-btn")) {
            startEdit(id);
        }
    });

    // 텍스트 더블클릭으로도 수정 시작
    todoList.addEventListener("dblclick", (event) => {
        if (!event.target.classList.contains("todo-text")) return;
        startEdit(getTodoId(event.target));
    });

    // 수정창: Enter 저장 / Esc 취소
    todoList.addEventListener("keydown", (event) => {
        if (!event.target.classList.contains("todo-edit")) return;
        if (event.isComposing) return; // 한글 조합 중의 Enter 는 글자 확정용이므로 무시

        if (event.key === "Enter") {
            finishEdit(getTodoId(event.target), event.target.value);
        } else if (event.key === "Escape") {
            cancelEdit();
        }
    });

    // 수정창 밖을 클릭하면 저장. blur 는 버블링되지 않아서 버블링되는 focusout 을 위임에 사용한다.
    todoList.addEventListener("focusout", (event) => {
        if (!event.target.classList.contains("todo-edit")) return;
        finishEdit(getTodoId(event.target), event.target.value);
    });

    clearButton.addEventListener("click", () => {
        commit(removeDoneTodos(todos));
    });

    /* =====================================================================
     * 9. 초기화
     * ===================================================================== */
    todayText.textContent = new Date().toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "long",
    });

    render();
    updateAddButton();
})();
