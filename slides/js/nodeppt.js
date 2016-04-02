(function ($win, $doc, $B, loadJS, loadCSS, undefined) {
    //用于单页ppt预加载资源
    var preloadFn = {
        loadJS: loadJS,
        loadCSS: loadCSS
    };

    var transitionEndEvent = function whichTransitionEvent() {
        var t;
        var el = document.createElement('fakeelement');
        var transitions = {
            'transition': 'transitionend',
            'OTransition': 'oTransitionEnd',
            'MozTransition': 'transitionend',
            'WebkitTransition': 'webkitTransitionEnd'
        };

        for (t in transitions) {
            if (el.style[t] !== undefined) {
                return transitions[t];
            }
        }
    }();

    var $body = $doc.body;
    var emptyFn = function () {};
    var emptyArr = [];

    var touchDX = 0; //touch事件x数据
    var touchDY = 0; //touch事件y数据
    var touchStartX = 0;
    var touchStartY = 0;
    var ISSYNC = false;

    var ctrlType = 'bind';
    var doHash = true;
    var lockSlide = false;
    var slideWidth; //单页宽度
    var slideHeight;
    var curIndex = 0; //当前幻灯片索引
    var pastIndex = 0; //上一个幻灯片索引
    var $progress; //进度条
    var $container; //幻灯片容器
    var $slides; //幻灯片集合
    var $drawBoard; //画板
    var $slideTip;
    var slideCount; //幻灯片总页数-1
    var slideJump = ''; //幻灯片跳转
    var QUERY = queryToJson(location.search);

    function queryToJson(url) {
        url = !!url ? decodeURIComponent(url) : '';

        var locse = url.split('?'),
            search = locse[1] ? locse[1] : locse[0],
            pairs = search.split('&'),
            result = {};

        pairs.forEach(function (pair) {
            pair = pair.split('=');
            if (pair[0].length > 0) {
                result[pair[0]] = pair[1] || '';
            }
        });

        return result;
    }
    var fullScreenApi = {
            supportsFullScreen: false,
            isFullScreen: function () {
                return false;
            },
            requestFullScreen: function () {},
            cancelFullScreen: function () {},
            fullScreenEventName: '',
            prefix: ''
        },
        browserPrefixes = 'webkit moz o ms'.split(' ');

    if (typeof document.cancelFullScreen != 'undefined') {
        fullScreenApi.supportsFullScreen = true;
    } else {
        for (var i = 0, il = browserPrefixes.length; i < il; i++) {
            fullScreenApi.prefix = browserPrefixes[i];

            if (typeof document[fullScreenApi.prefix + 'CancelFullScreen'] != 'undefined') {
                fullScreenApi.supportsFullScreen = true;

                break;
            }
        }
    }

    if (fullScreenApi.supportsFullScreen) {
        fullScreenApi.fullScreenEventName = fullScreenApi.prefix + 'fullscreenchange';

        fullScreenApi.isFullScreen = function () {
            switch (this.prefix) {
                case '':
                    return document.fullScreen;
                case 'webkit':
                    return document.webkitIsFullScreen;
                default:
                    return document[this.prefix + 'FullScreen'];
            }
        };
        fullScreenApi.requestFullScreen = function (el) {
            return (this.prefix === '') ? el.requestFullScreen() : el[this.prefix + 'RequestFullScreen']();
        };
        fullScreenApi.cancelFullScreen = function (el) {
            return (this.prefix === '') ? document.cancelFullScreen() : document[this.prefix + 'CancelFullScreen']();
        };
    }



    function dispatchEvent($dom, name, data) {
        if (!$dom || typeof $dom.dispatchEvent !== 'function') {
            data = name;
            name = $dom;
            $dom = null;
        }
        var event = document.createEvent('Event');
        event.initEvent('ppt' + name, true, true);
        event.stopped = false;
        event.stop = function () {
            event.preventDefault();
            event.stopPropagation();
            event.stopped = true;
        };
        if (data) {
            for (var i in data) {
                if (data.hasOwnProperty(i)) {
                    event[i] = data[i];
                }
            }
        }
        $dom && $dom.dispatchEvent && $dom.dispatchEvent(event);
        return event;
    }
    //设置底部进度条
    function setProgress() {
        //添加dataset
        Slide.current = curIndex + 1;
        if ($progress) {
            $progress.style.width = ((curIndex + 1) / (slideCount + 1)) * 100 + '%';
        }
    }

    //泛数组转换为数组
    function toArray(arrayLike) {
        return emptyArr.slice.call(arrayLike);
    }

    //封装选择器
    function $(selector, context) {
        context = (context && context.nodeType === 1) ? context : $doc;
        return context.querySelectorAll(selector);
    }

    //getID方法
    function $$(id) {
        return $doc.getElementById(id);
    }

    //上一页
    function prevSlide(isControl) {

        if (buildPrevItem()) {
            Slide.curItem--;
            return;
        }
        Slide.curItem = 0;
        slideOutCallBack($slides[curIndex]);
        pastIndex = curIndex;
        --curIndex < 0 && (curIndex = 0);
        doSlide('prev', isControl ? false : true);
    }

    //下一页
    function nextSlide(isControl) {
        if (buildNextItem()) {
            Slide.curItem++;
            return;
        }
        Slide.curItem = 0;
        slideOutCallBack($slides[curIndex]);
        pastIndex = curIndex;
        ++curIndex > slideCount && (curIndex = slideCount);
        doSlide('next', isControl ? false : true);
        //预加载
        preload($slides[curIndex])($slides[curIndex + 1]);
    }


    //slide切入回调incallback
    //<slide data-incallback=""
    var slideInTimer;

    function slideInCallBack() {
        if (slideInTimer) {
            clearTimeout(slideInTimer);
        }
        //休息休息一下~
        slideInTimer = setTimeout(slideInCallBack_, 800);
    }

    function getCallbackFuncFromName(cbNames) {
        if (!cbNames) {
            return cbNames;
        }
        cbNames = cbNames.split('.');
        var cb = window;
        for (var i = 0, len = cbNames.length; i < len; i++) {
            var type = typeof cb[cbNames[i]];
            if (type === 'object' || type === 'function') {
                cb = cb[cbNames[i]];
            } else {
                break;
            }
        }
        if (typeof cb === 'function') {
            return cb;
        }
        return null;
    }

    function slideInCallBack_() {
        var $cur = $slides[curIndex];
        if (!$cur || ($cur && $cur.nodeType !== 1)) {
            return;
        }
        var dataset = $cur.dataset;
        var cbNames = dataset.incallback || dataset.onEnter;
        var cb = getCallbackFuncFromName(cbNames);
        var event = dispatchEvent('Enter', {
            container: $cur
        });
        //如果有data-incallback那么就执行callback
        cb && typeof cb === 'function' && proxyFn(cbNames, event);


        //事件：keypress接管，build接管
        ['Keypress', 'Build'].forEach(function (v) {
            var callback = dataset['on' + v];
            callback = getCallbackFuncFromName(callback);
            if (callback && typeof callback === 'function') {
                $cur.addEventListener('ppt' + v, callback, true);
            }
        });

        //检测iframe
        var $iframe = toArray($('iframe[data-src]', $cur));
        if ($iframe.length) {
            $iframe.forEach(function (v) {
                var src = v.dataset.src;
                if (src) {
                    //防止二次加载
                    v.src = src;
                    delete v.dataset.src;
                }
            });

        }
    }

    //slide切出回调outcallback
    //<slide data-outcallback=""
    var slideOutTimer;

    function slideOutCallBack(prev) {
        if (!prev || (prev && prev.nodeType !== 1)) {
            return;
        }
        if (slideOutTimer) {
            clearTimeout(slideOutTimer);
        }
        slideOutTimer = setTimeout(function () {
            slideOutCallBack_(prev);
        }, 1500);
    }

    function slideOutCallBack_(prev) {
        var dataset = prev.dataset;
        var cbNames = dataset.outcallback || dataset.onLeave;
        var cb = getCallbackFuncFromName(cbNames);
        var event = dispatchEvent('Leave', {
            container: prev
        });
        //如果有data-outcallback那么就执行callback
        cb && typeof cb === 'function' && proxyFn(cbNames, event);

        //解绑事件：keypress，build
        ['Keypress', 'Build'].forEach(function (v) {
            var callback = dataset['on' + v];
            callback = getCallbackFuncFromName(callback);
            if (callback && typeof callback === 'function') {
                prev.removeEventListener('ppt' + v, callback, true);
            }
        });
    }

    //预加载资源
    //<preload data-type="js||css" data-url="">
    function preload(node) {
        var self = arguments.callee;
        if (node && node.nodeType === 1) {
            var $preload = $('preload', node),
                len = $preload.length;
            while (len--) {
                var tmpNode = $preload[len],
                    dataset = tmpNode.dataset,
                    type = dataset.type,
                    url = dataset.url;
                var fn = preloadFn['load' + type.toUpperCase()];
                typeof fn === 'function' && fn(url, function (tmpNode) {
                    return function () {
                        //将该标签删除，释放内存
                        tmpNode.parentNode && tmpNode.parentNode.removeChild(tmpNode);
                        tmpNode = null;
                    };
                }(tmpNode));
            }
        }
        return self;
    }


    //单行前进
    function buildNextItem(iscontrol) {
        if ($body.classList.contains('overview')) {
            return false;
        }
        $curSlide = $slides[curIndex];
        //自定义事件，直接返回
        var event = dispatchEvent($curSlide, 'Build', {
            direction: 'next',
            container: $curSlide
        });
        if (event.stopped) {
            return event.stopped;
        }


        var subBuilded = toArray($('.building'), $curSlide);
        var list;
        if (subBuilded.length) {

            while (list = subBuilded.shift()) {
                list = list.classList
                list.remove('building');
                list.add('builded');
            }
        }
        var toBuild = $('.tobuild', $curSlide);

        if (!toBuild.length) {
            return false;
        }

        var item = toBuild.item(0);
        list = item.classList;
        list.remove('tobuild');

        if (list.contains('subSlide')) {
            toArray($('.subSlide.builded', $curSlide)).forEach(function ($item) {
                $item.classList.add('subBuilded');
            });
        }

        list.add('building');
        return true;
    }

    //单条往后走
    function buildPrevItem(iscontrol) {
        if ($body.classList.contains('overview')) {
            return false;
        }
        $curSlide = $slides[curIndex];

        //自定义事件，直接返回
        var event = dispatchEvent($curSlide, 'Build', {
            direction: 'prev',
            container: $curSlide
        });
        if (event.stopped) {
            return event.stopped;
        }
        var subBuilded = toArray($('.building'), $curSlide);
        var list;
        var buildingLen = subBuilded.length;
        var curList;

        if (buildingLen) {
            while (list = subBuilded.shift()) {
                var clist = list.classList
                clist.remove('building');
                clist.add('tobuild');
                curList = list;
                if (clist.contains('subSlide')) {
                    var $item = toArray($('.subSlide.builded.subBuilded', $curSlide)).pop();
                    $item && $item.classList.remove('subBuilded');
                }
            }
        }
        var builded = toArray($('.builded', $curSlide));
        if (!builded.length && !buildingLen) {
            return false;
        }

        var item = builded.pop();
        if (item) {
            if (!curList) {
                curList = item;
            }
            list = item.classList;
            list.remove('builded');
            if (buildingLen === 0) {
                list.add('tobuild');
                item = builded.pop();
                item.classList.remove('builded');
                item.classList.add('building');
            } else {
                list.add('building');
            }

        }
        return true;
    }

    //设置单行页面添加
    function makeBuildLists() {
        var i = slideCount;
        var slide;
        var transition = defaultOptions.transition;
        var buildClass = '.build > *,.fadeIn > *,.rollIn > *,.moveIn > *,.bounceIn > *,.zoomIn > *,.fade > *,.subSlide';
        while (slide = $slides[i--]) {

            var $items = toArray($(buildClass, slide));
            var dataset = slide.dataset;
            $items.forEach(function ($v, i) {
                $v.classList.add('tobuild');
                if (!('index' in $v.dataset)) {
                    $v.dataset.index = i;
                }
            });

            if (!dataset.transition) {
                dataset.transition = transition;
            }
        }

    }

    //切换动画
    function doSlide(direction) {
        // $container.style.marginLeft = -(slideID * slideWidth) + 'px';
        updateSlideClass();
        setProgress();
        if (doHash) {
            lockSlide = true;
            $win.location.hash = "#" + curIndex;
        }
        slideInCallBack(direction);
        removePaint();

        if ($doc.body.classList.contains('overview')) {
            focusOverview_();
            return;
        } else if (!$doc.body.classList.contains('popup')) {
            $doc.body.classList.remove('with-notes');
        }

    }

    function updateSlideClass() {
        var curSlide = curIndex;
        var pageClass = 'pagedown';
        if (pastIndex === curIndex) {
            $cur = $slides[curIndex];
            if ($cur.classList.contains('pageup')) {
                return;
            }
        }
        if (pastIndex > curIndex) {
            //往前翻页
            pageClass = 'pageup';
        } else {
            //往后翻页
        }
        for (var i = 0, len = $slides.length; i < len; ++i) {
            switch (i) {
                case curSlide - 2:
                    updateSlideClass_($slides[i], 'far-past', pageClass);
                    break;
                case curSlide - 1:
                    updateSlideClass_($slides[i], 'past', pageClass);
                    break;
                case curSlide:
                    updateSlideClass_($slides[i], 'current', pageClass);
                    break;
                case curSlide + 1:
                    updateSlideClass_($slides[i], 'next', pageClass);
                    break;
                case curSlide + 2:
                    updateSlideClass_($slides[i], 'far-next', pageClass);
                    break;
                default:
                    updateSlideClass_($slides[i]);
                    break;
            }
        }
        $B.fire('slide.update', curIndex, 0, pageClass);

    }

    function overview(isFromControl) {
        $body.classList.toggle('overview');
        focusOverview_();
        if (!isFromControl) {
            $B.fire('overview');
        }
    }

    function focusOverview_() {
        var isOV = $doc.body.classList.contains('overview');
        for (var i = 0, slide; slide = $slides[i]; i++) {
            slide.style.transform = slide.style.webkitTransform = slide.style.msTransform = slide.style.mozTransform = isOV ?
                'translateZ(-2500px) translate(' + ((i - curIndex) * 105) +
                '%, 0%)' : '';
            slide.style.animation = slide.style.webkitAnimation = slide.style.msAnimation = slide.style.mozAnimation = isOV ?
                'none' : '';
            Slide.fire(isOV ? 'overviewshown' : 'overviewhidden');
        }
    }

    function updateSlideClass_(el, className, pageClass) {
        // var el = $slides[slideNo];

        if (!el) {
            return;
        }
        if (className) {
            el.classList.add(className);
        }
        if (pageClass && location.href.indexOf('_multiscreen=control') === -1 && location.href.indexOf('iscontroller=1') === -1) {
            el.classList.add(pageClass);
        }

        var arr = ['next', 'past', 'far-next', 'far-past', 'current', 'pagedown', 'pageup'];
        arr.forEach(function (v) {
            if (className !== v && pageClass !== v) {
                el.classList.remove(v);
            }
        });

    }

    //显示tips
    function showTips(msg) {
        if (!$slideTip) {
            return;
        }
        $slideTip.innerHTML = msg;
        $slideTip.style.display = 'block';
        setTimeout(function () {
            $slideTip.style.display = 'none';
        }, 3E3);
    }


    /*************************events***************/

    //pc键盘翻页事件逻辑
    function evtkeydown(e) {
        try {
            e.preventDefault(); //j防止按键盘后，页面走位
        } catch (err) {
            console.log(err);
        }
        return false;
    }

    function evtDocUp(e) {
        var key = e.keyCode;
        // console.log(key);
        var target = e.target;
        //防止input和textarea，和可以编辑tag
        if (/^(input|textarea)$/i.test(target.nodeName) || target.isContentEditable) {
            return;
        }
        if (!e.isFromControl) {
            $B.fire('nodepptEvent:eventKeyup', e);
        }
        $B.fire('slide.keyup', e);

        var $curSlide = $slides[curIndex];
        var event = dispatchEvent($curSlide, 'Keypress', {
            keyCode: key,
            orgiTarget: target,
            container: $curSlide
        });
        if (event.stopped) {
            return event.stopped;
        }

        switch (key) {
            case 122:
                //全屏
                if (fullScreenApi.supportsFullScreen) {
                    fullScreenApi.requestFullScreen(document.body);
                }
                break;
            case 13:
                // Enter
                if ($doc.body.classList.contains('overview')) {
                    overview(e.isFromControl);
                } else {
                    //j  幻灯片跳转
                    var slideJumpIndex = parseInt(slideJump) - 1;
                    if (slideJumpIndex >= 0 && slideJumpIndex <= slideCount) {
                        jumpSlide(slideJumpIndex);
                    }
                }
                slideJump = '';
                break;
            case 72:
                // H: Toggle code highlighting
                $doc.body.classList.toggle('highlight-code');
                setTimeout(function () {
                    $doc.body.classList.toggle('highlight-code');
                }, 2000);
                break;
                // 下掉宽屏模式，默认width：100%
            case 87:
                // W: Toggle widescreen
                // Only respect 'w' on body. Don't want to capture keys from an <input>.
                if (!(e.shiftKey && e.metaKey)) {
                    if (!$body.classList.contains('popup'))
                        $container.classList.toggle('layout-widescreen');
                }
                break;
            case 79:
                // O: Toggle overview
                overview(e.isFromControl);

                break;
            case 78:
                // N
                if (!$body.classList.contains('popup'))
                    $doc.body.classList.toggle('with-notes');
                break;
            case 80:
                //P
                if (!$body.classList.contains('popup')) {
                    showPaint(e.isFromControl);
                }
                break;
            case 66:
                //b
                if ($drawBoard.context) {
                    $drawBoard.context.strokeStyle = 'rgba(0,0,255,0.5)'; //j pen_blue
                    break;
                }
            case 89:
                //y
                if ($drawBoard.context) {
                    $drawBoard.context.strokeStyle = 'rgba(255,255,0,0.5)'; //pen_yellow
                    break;
                }
            case 82:
                //r
                if ($drawBoard.context) {
                    $drawBoard.context.strokeStyle = 'rgba(255,0,0,0.5)'; //pen_red
                    break;
                }
            case 71:
                //g
                if ($drawBoard.context) {
                    $drawBoard.context.strokeStyle = 'rgba(0,255,0,0.5)'; //pen_green
                    break;
                }
            case 77:
                //m
                if ($drawBoard.context) {
                    $drawBoard.context.strokeStyle = 'rgba(255,0,255,0.5)'; //pen_magenta
                    break;
                }
            case 49:
                //1
                slideJump = slideJump + '1';
                if ($drawBoard.context) {
                    $drawBoard.context.lineWidth = 3;
                }
                break;
            case 50:
                //2
                slideJump = slideJump + '2';
                if ($drawBoard.context) {
                    $drawBoard.context.lineWidth = 7;
                }
                break;
            case 51:
                //3
                slideJump = slideJump + '3';
                if ($drawBoard.context) {
                    $drawBoard.context.lineWidth = 11;
                }
                break;
            case 52:
                //4
                slideJump = slideJump + '4';
                if ($drawBoard.context) {
                    $drawBoard.context.lineWidth = 15; //j 笔粗细
                }
                break;
            case 48:
                slideJump = slideJump + '0';
                break;
            case 53:
                slideJump = slideJump + '5';
                break;
            case 54:
                slideJump = slideJump + '6';
                break;
            case 55:
                slideJump = slideJump + '7';
                break;
            case 56:
                slideJump = slideJump + '8';
                break;
            case 57:
                slideJump = slideJump + '9'; //j 幻灯片跳转
                break;
            case 67:
                //c
                if (!$body.classList.contains('popup')) {
                    removePaint(e.isFromControl);
                }
                break;
                //上一页
            case 33:
                // pg up
            case 37:
                // left
            case 38:
                // up
                prevSlide();
                break;
                //下一页
            case 32:
                // space
            case 34:
                // pg down
            case 39:
                // right
            case 40:
                // down
                nextSlide();
                break;
        }


    }

    /******************************** Touch events *********************/
    var isStopTouchEvent = false;

    function evtTouchStart(event) {
        if (!isStopTouchEvent && event.touches.length === 1) {
            touchDX = 0;
            touchDY = 0;
            var touch = event.touches[0];
            touchStartX = touch.pageX;
            touchStartY = touch.pageY;
            //捕获，尽早发现事件
            $body.addEventListener('touchmove', evtTouchMove, true);
            $body.addEventListener('touchend', evtTouchEnd, true);
        }
    }

    //touch事件
    function evtTouchMove(event) {
        if (event.touches.length > 1) {
            cancelTouch();
        } else {
            var touch = event.touches[0];

            touchDX = touch.pageX - touchStartX;
            touchDY = touch.pageY - touchStartY;
        }
        try {
            event.preventDefault();
        } catch (err) {
            console.log(err);
        }
    }

    //touchend事件
    function evtTouchEnd(event) {
        var dx = Math.abs(touchDX);
        var dy = Math.abs(touchDY);

        if ((dx > 15) && (dy < (dx * 2 / 3))) {
            if (touchDX > 0) {
                cancelTouch();
                return createKeyEvent(38);
                // prevSlide();
            } else {
                // nextSlide();
            }
        }
        createKeyEvent(39);

        cancelTouch();
    }

    function createKeyEvent(keyCode) {
        var evt = document.createEvent('Event');
        evt.initEvent('keyup', true, true);
        evt.keyCode = keyCode;

        document.dispatchEvent(evt);
    }
    //取消绑定
    function cancelTouch() {
        $body.removeEventListener('touchmove', evtTouchMove, true);
        $body.removeEventListener('touchend', evtTouchEnd, true);
    }

    //绑定事件
    function bindEvent() {
        $doc.addEventListener('keyup', evtDocUp, false);
        // $doc.addEventListener('keydown', evtkeydown, false); //j 防止页面走位
        // $doc.addEventListener('keypress', evtkeydown, false); //j 防止页面走位
        $body.addEventListener('touchstart', evtTouchStart, false);
        $$('_btn-bar').addEventListener('click', function () {
            var isOpen = false;
            return function () {
                if (!isOpen) {
                    this.classList.remove('fa-bars');
                    this.classList.add('fa-close');
                    $$('_btn-box').style.display = 'inline-block';
                } else {
                    this.classList.remove('fa-close');
                    this.classList.add('fa-bars');
                    $$('_btn-box').style.display = 'none';

                }
                isOpen = !isOpen;
            };
        }(), false);
        $$('_btn-prev').addEventListener('click', function () {
            createKeyEvent(38);
        }, false);
        $$('_btn-next').addEventListener('click', function () {
            createKeyEvent(39);
        }, false);
        $$('_btn-overview').addEventListener('click', function () {
            var isOpen = false;
            return function () {

                if (isOpen) {
                    this.classList.add('fa-compress');
                    this.classList.remove('fa-expand');
                } else {
                    this.classList.add('fa-expand');
                    this.classList.remove('fa-compress');
                }

                overview();
                isOpen = !isOpen;
            };
        }(), false);
        $$('_btn-brush').addEventListener('click', function () {
            var isOpen = false;
            return function () {
                if (isOpen) {
                    this.classList.add('fa-paint-brush');
                    this.classList.remove('fa-eraser');
                    removePaint();
                } else {
                    showPaint();
                    this.classList.add('fa-eraser');
                    this.classList.remove('fa-paint-brush');
                }
                isOpen = !isOpen;
            };
        }(), false);

        $win.addEventListener('hashchange', function () {
            if (location.hash && !lockSlide) {
                doHash = false;
                slideOutCallBack($slides[curIndex]);
                pastIndex = curIndex;
                curIndex = location.hash.substr(1) | 0;

                doSlide();
                doHash = true;
            }
            lockSlide = false;
        }, true);
    }


    /***********画图部分事件处理函数************/
    //画图前准备

    function drawCanvasReady() {
        $drawBoard.context = $drawBoard.getContext('2d');
        var context = $drawBoard.context;
        context.lineWidth = 3;
        // context.lineCap = 'square'; //'round';
        context.lineJoin = 'round'; //'bevel';
        context.strokeStyle = 'rgba(255,0,0,0.5)'; //"red";
    }

    //显示画板
    var isControl = 0;

    function showPaint(isFromControl) {
        if (!$drawBoard) {
            return;
        }

        //1、将翻页停止
        isStopTouchEvent = true;
        //2、将管理模式去掉
        if ($body.classList.contains('with-notes')) {
            isControl = 1;
            $body.classList.remove('with-notes');
            $body.classList.remove('popup');
        }
        $drawBoard.width = $body.clientWidth;
        $drawBoard.height = $body.clientHeight;
        drawCanvasReady();

        $drawBoard.style.display = '';
        $container.style.overflow = 'hidden';

        $drawBoard.addEventListener('mousedown', pMouseDown, true);
        $drawBoard.addEventListener('mouseup', pMouseUp, true);
        $drawBoard.addEventListener('mousemove', pMouseMove, true);
        //滑动
        $drawBoard.addEventListener('touchmove', pMouseMove, true);
        $drawBoard.addEventListener('touchend', pMouseUp, true);
        $drawBoard.addEventListener('touchcancel', pMouseUp, true);
        $drawBoard.addEventListener('touchstart', pMouseDown, true);

        $doc.addEventListener('selectstart', stopSelect, true);
        if (!isFromControl) {
            $B.fire('nodepptEvent:show paint');
        }
    }

    //禁止选中
    function stopSelect() {
        return false;
    }

    //清除画板内容
    function clearPaint() {
        $container.style.overflow = '';
        $drawBoard.context && $drawBoard.context.clearRect(0, 0, slideWidth, slideHeight);
        $drawBoard.style.display = 'none';
    }

    //删除画板
    var removePaint = function (isFromControl) {
        clearPaint();
        slideJump = ''; //j 幻灯片跳转
        if (isControl) {
            $body.classList.add('with-notes');
            $body.classList.add('popup');
        }
        isStopTouchEvent = false;
        $drawBoard.removeEventListener('mousedown', pMouseDown);
        $drawBoard.removeEventListener('mouseup', pMouseUp);
        $drawBoard.removeEventListener('mousemove', pMouseMove);
        //滑动
        $drawBoard.removeEventListener('touchstart', pMouseDown);
        $drawBoard.removeEventListener('touchmove', pMouseMove);
        $drawBoard.removeEventListener('touchend', pMouseUp);
        $drawBoard.removeEventListener('touchcancel', pMouseUp);


        $doc.removeEventListener('selectstart', stopSelect, true);
        if (!isFromControl) {
            $B.fire('nodepptEvent:remove paint');
        }
    };
    var pMouseDown = function (e) {
        $drawBoard.isMouseDown = true;
        try { //j 触屏画笔
            var touch = e.targetTouches[0];
            e = touch;
        } catch (err) {}
        //        $drawBoard.iLastX = e.clientX - $drawBoard.offsetLeft + ($win.pageXOffset || $doc.body.scrollLeft || $doc.documentElement.scrollLeft);
        //        $drawBoard.iLastY = e.clientY - $drawBoard.offsetTop + ($win.pageYOffset || $doc.body.scrollTop || $doc.documentElement.scrollTop);
        var x = $drawBoard.iLastX = e.layerX || e.offsetX || (e.clientX - $drawBoard.offsetLeft + ($win.pageXOffset || $doc.body.scrollLeft || $doc.documentElement.scrollLeft));
        var y = $drawBoard.iLastY = e.layerY || e.offsetY || (e.clientY - $drawBoard.offsetTop + ($win.pageYOffset || $doc.body.scrollTop || $doc.documentElement.scrollTop));
        pPoints.push({
            x: x,
            y: y
        });
        return false; //j 触屏画笔
    };
    var pPoints = [];
    var pMouseUp = function (e) {
        $drawBoard.isMouseDown = false;
        $drawBoard.iLastX = -1;
        $drawBoard.iLastY = -1;
        if (!e.isFromControl) {
            $B.fire('nodepptEvent:paint points', pPoints);
        }
        pPoints.length = 0;
    };
    $B.on('controlEvent:paint points', function (data) {
        var points = data.points;
        //远程来的屏幕
        var wh = data.screen;
        var tOX = wh.width / 2,
            tOY = wh.height / 2;

        var width = $body.offsetWidth;
        var height = $body.offsetHeight;
        var cOX = width / 2,
            cOY = height / 2;

        var iw = width / wh.width;
        var ih = height / wh.height;

        var context = $drawBoard.context;
        if (!context) {
            return;
        }
        context.beginPath();
        var startX = cOX - (tOX - points[0].x) * iw;
        var startY = cOY - (tOY - points[0].y) * ih;
        // console.log(startX, points[0].x, startY, iw, wh);
        context.moveTo(startX, startY);
        for (var i = 0, len = points.length; i < len; i++) {
            context.lineTo(cOX - (tOX - points[i].x) * iw, cOY - (tOY - points[i].y) * ih);
        }
        context.stroke();
    });
    var pMouseMove = function (e) {
        var ee = e;
        if ($drawBoard.isMouseDown) {
            try { //j 触屏画笔
                var touch = e.targetTouches[0];
                e = touch;
            } catch (err) {
                console.log(err);
            }
            //            var iX = e.clientX - $drawBoard.offsetLeft + ($win.pageXOffset || $doc.body.scrollLeft || $doc.documentElement.scrollLeft);
            //            var iY = e.clientY - $drawBoard.offsetTop + ($win.pageYOffset || $doc.body.scrollTop || $doc.documentElement.scrollTop);
            var iX = e.layerX || e.offsetX || (e.clientX - $drawBoard.offsetLeft + ($win.pageXOffset || $doc.body.scrollLeft || $doc.documentElement.scrollLeft));
            var iY = e.layerY || e.offsetY || (e.clientY - $drawBoard.offsetTop + ($win.pageYOffset || $doc.body.scrollTop || $doc.documentElement.scrollTop));
            var context = $drawBoard.context;
            context.beginPath();
            context.moveTo($drawBoard.iLastX, $drawBoard.iLastY);
            context.lineTo(iX, iY);
            context.stroke();
            $drawBoard.iLastX = iX;
            $drawBoard.iLastY = iY;
            pPoints.push({
                x: iX,
                y: iY
            });
            try {
                ee.preventDefault();
            } catch (err) {
                console.log(err);
            }
            return false; //j 触屏画笔
        }
    };

    //代理函数，用于函数控制
    function proxyFn(fnName, args) {
        var cb = getCallbackFuncFromName(fnName);
        cb(args);
    }

    /**
     * 默认配置
     * @type {Object}
     */
    var defaultOptions = {
        containerID: 'container',
        isControlDevice: false,
        drawBoardID: 'drawBoard',
        slideClass: '.slide',
        buildClass: '.build',
        progressID: 'progress',
        transition: '',
        tipID: 'tip',
        webSocketHost: '',
        width: 900,
        dir: './',
        height: 700,
        control: false
    };

    //初始化变量
    function initVar() {
        $slideTip = $$(defaultOptions.tipID);
        $container = $$(defaultOptions.containerID);
        slideWidth = defaultOptions.width;
        slideHeight = defaultOptions.height;
        $progress = $$(defaultOptions.progressID);
        Slide.$slides = $slides = toArray($(defaultOptions.slideClass, $container));

        slideCount = $slides.length; //幻灯片总页数-1
        Slide.count = slideCount;

        // $container.style.width = slideCount*slideWidth + 'px';//设置容器总宽度
        slideCount--;
        $drawBoard = $$(defaultOptions.drawBoardID);
        if ($drawBoard) {
            $drawBoard.style.display = 'none';
        }
    }

    function fullImg() {
        loadJS(defaultOptions.dir + 'img.screenfull.js', function () {
            //图片处理
            var $imgs = toArray($(defaultOptions.slideClass + ' img', $container));
            screenfull($imgs);
        });
    }

    function loadTheme() {
        if (defaultOptions.theme) {
            loadCSS('/css/theme.' + defaultOptions.theme + '.css');
        }
    }

    //如果是print则需要修改
    function iPrint() {
        if (QUERY && QUERY.print) {
            toArray($('iframe[data-src]')).forEach(function (v) {
                if (v.src.indexOf('about:blank') === 0 && v.dataset.src) {
                    v.src = v.dataset.src;
                }
            });
        }
    }


    //初始化
    function init(options) {
        options = options || {};

        for (var key in defaultOptions) {
            if (!!(key in options)) {
                defaultOptions[key] = options[key];
            }
        }
        ['theme', 'transition'].forEach(function (v) {
            if (QUERY && QUERY[v]) {
                defaultOptions[v] = QUERY[v];
            }
        });

        Slide.dir = defaultOptions.dir;
        if (defaultOptions.control) {
            var control = defaultOptions.control;
            loadJS(defaultOptions.dir + 'nodeppt.control.js', function () {
                Slide.Control.load(control.type, control.args);
            });
        }

        initVar(); //初始化变量
        loadTheme();
        makeBuildLists();
        fullImg(); //图片全屏
        bindEvent();
        pastIndex = curIndex;
        if (QUERY && QUERY.print) {
            iPrint(); //打印
        } else {
            if (location.hash && (curIndex = (location.hash.substr(1) | 0))) {
                doSlide();
            } else {
                updateSlideClass();
                setProgress();
                slideInCallBack();
            }
            preload($slides[curIndex])($slides[curIndex + 1]);
        }

        $body.style.opacity = 1;
    }

    function magic(e) {
        var $cur = $('.magic', e.container);
        if ($cur.length) {
            $cur = $cur[0];
        } else {
            return;
        }
        var index = ($cur.dataset.index || 0) | 0;

        var pageClass = 'pagedown';

        if (e.direction === 'prev') {
            //往前翻页
            pageClass = 'pageup';
        }
        var $slides = toArray($('.magicItem', $cur));
        var len = $slides.length;

        if (!e.firstKiss) {
            if (e.direction === 'prev') {
                index--;
                if (index < 0) {
                    index = 0;
                    $cur.dataset.index = index;
                    //标示状态
                    $cur.dataset.status = 'wait';
                    return;
                } else {
                    e.stop();
                }
            } else {
                index++;
                if (index === len) {
                    index = len - 1;
                    $cur.dataset.index = index;
                    //标示状态
                    $cur.dataset.status = 'done';
                    return;
                } else {
                    e.stop();
                }
            }
            $cur.dataset.index = index;
        }
        if (e.firstKiss) {
            var $curSlide = $slides[index];
            $curSlide.addEventListener(transitionEndEvent, function () {
                $cur.style.visibility = 'visible';
            });
        }
        for (var i = 0; i < len; ++i) {
            switch (i) {
                case index - 2:
                    updateSlideClass_($slides[i], 'far-past', pageClass);
                    break;
                case index - 1:
                    updateSlideClass_($slides[i], 'past', pageClass);
                    break;
                case index:
                    updateSlideClass_($slides[i], 'current', pageClass);
                    break;
                case index + 1:
                    updateSlideClass_($slides[i], 'next', pageClass);
                    break;
                case index + 2:
                    updateSlideClass_($slides[i], 'far-next', pageClass);
                    break;
                default:
                    updateSlideClass_($slides[i]);
                    break;
            }
        }


    }
    magic.init = function (e) {
        var $cur = $('.magic', e.container);
        if ($cur.length) {
            $cur = $cur[0];
        } else {
            return;
        }

        var index = $cur.dataset.index || 0;
        switch ($cur.dataset.status) {
            case 'done':
                //说明从完成的地方往前翻页
                $cur.dataset.index = index;
                index--;
                break;
            case 'wait':
                //说明已经到了第一页了
                break;
            default:
                //第一次进入
                e.firstKiss = true;
                magic(e);
        }

    };
    var Slide = {
        current: 0,
        curItem: 0,
        init: init,
        setIndex: function (i, item) {
            i--;
            if (i < 0) {
                i = 0;
            }
            jumpSlide(i);
            if (item > 0) {
                buildItem();
            }

            function buildItem() {
                if (item-- <= 0) {
                    return;
                } else {
                    buildNextItem();
                }
                setTimeout(buildItem, 300);
            }
            // this.curItem = item;
        },
        next: nextSlide,
        prev: prevSlide,
        doSlide: doSlide,
        proxyFn: proxyFn,
        showPaint: showPaint,
        removePaint: removePaint,
        buildNextItem: buildNextItem,
        buildPrevItem: buildPrevItem,
        magic: magic
    };
    ['on', 'un', 'fire'].forEach(function (v) {
        Slide[v] = function () {
            var args = toArray(arguments);
            args[0] = 'slide.' + args[0];
            $B[v].apply(null, args);
        };
    });

    function getcurIndex() { //j外部控制跳转
        return curIndex;
    }

    function jumpSlide(gotoIndex) { //j外部控制跳转
        pastIndex = gotoIndex - 1;
        pastIndex = pastIndex < 0 ? 0 : pastIndex;
        curIndex = gotoIndex;
        doSlide();
    }
    $win.Slide = Slide;
    $win.jumpSlide = jumpSlide; //j外部控制跳转
    $win.getcurIndex = getcurIndex; //j外部控制跳转
    try {
        if (window.console && window.console.log) {
            console.log('Powered By nodePPT, %c https://github.com/ksky521/nodePPT', 'color:red');
            console.log('Install nodePPT: %c npm install -g nodeppt', 'color:red');
        }
    } catch (e) {}
}(window, document, MixJS.event.broadcast, MixJS.loadJS, MixJS.loadCSS));
