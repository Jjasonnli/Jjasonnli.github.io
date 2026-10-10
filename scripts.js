$(document).ready(function () {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const nameOptions = [
        { text: "JASON LI", step: 1 / 3 },
        { text: "Software Engineering @ DREXEL", step: 1 / 2 },
        { text: "MUSIC LOVER", step: 1 / 3 },
        { text: "CAR ENTHUSIAST", step: 1 / 2 }
    ];

    const englishName = document.getElementById("english-name");
    const idleWarning = document.getElementById("idle-warning");
    const chineseName = document.getElementById("chinese-name");
    const navbar = document.getElementById("navbar");
    const cover = document.getElementById("cover");
    const navbarHeight = navbar.offsetHeight;

    let mouseOver = 0;
    let interval = null;
    let firstTime = true;
    const startTime = Date.now();

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("show");
            }
        });
    }, { threshold: 0.4 });

    document.querySelectorAll(".hidden").forEach((element) => observer.observe(element));

    const idleInterval = setInterval(() => {
        if (Date.now() - startTime >= 3000) {
            clearInterval(idleInterval);
            if (mouseOver === 0) {
                idleWarning.style.bottom = `-${idleWarning.offsetHeight}px`;
                idleWarning.style.opacity = "0.5";
                idleWarning.style.transition = "opacity 1s";
            }
        }
    }, 1000);

    function scrambleText(target, text, step, onComplete) {
        let iteration = 0;

        clearInterval(interval);
        interval = setInterval(() => {
            target.innerText = [...text]
                .map((letter, index) => index < iteration
                    ? letter
                    : letters[Math.floor(Math.random() * letters.length)])
                .join("");

            if (iteration >= text.length) {
                clearInterval(interval);
                onComplete?.();
            }
            iteration += step;
        }, 50);
    }

    function revealPage() {
        idleWarning.style.opacity = "0.0";
        idleWarning.style.transition = "opacity 0.7s";
        chineseName.style.opacity = "0.35";
        chineseName.style.transition = "opacity 3s";
        navbar.style.opacity = "1.0";
        navbar.style.transition = "opacity 2s";
        navbar.style.animationName = "slideUp";
        navbar.style.animationDuration = "1s";

        ["skills-main", "projects-main", "about-main", "separator-one", "separator-two"]
            .forEach((id) => {
                document.getElementById(id).style.display = "block";
            });
        document.querySelector("footer").style.display = "block";
    }

    function runIntroSequence() {
        cover.style.display = "block";
        cover.style.top = `${navbarHeight}px`;

        nameOptions.slice(1).forEach((option, index) => {
            setTimeout(() => {
                scrambleText(englishName, option.text, option.step);
            }, (index + 1) * 2500);
        });

        setTimeout(() => {
            scrambleText(englishName, nameOptions[0].text, nameOptions[0].step);
        }, 10000);
        setTimeout(() => {
            cover.style.display = "none";
        }, 12500);
    }

    function handleNameInteraction(event) {
        const optionIndex = mouseOver % nameOptions.length;
        const option = nameOptions[optionIndex];

        scrambleText(event.target, option.text, option.step, () => {
            if (optionIndex === 0) {
                revealPage();
                mouseOver++;

                if (firstTime) {
                    runIntroSequence();
                    firstTime = false;
                }
            } else {
                mouseOver++;
            }
        });
    }

    englishName.onmouseover = handleNameInteraction;
    englishName.onclick = handleNameInteraction;
});
