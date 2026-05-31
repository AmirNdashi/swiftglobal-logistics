/* ============================================
   SWIFTTGLOBAL LOGISTICS — MAIN JS
   ============================================ */

document.addEventListener("DOMContentLoaded", () => {
  /* ---------- 1. PRELOADER ---------- */
  const preloader = document.querySelector(".preloader");
  if (preloader) {
    window.addEventListener("load", () => {
      preloader.classList.add("hidden");
    });
  }

  /* ---------- 2. SCROLL PROGRESS BAR ---------- */
  const progressBar = document.querySelector(".scroll-progress");
  if (progressBar) {
    window.addEventListener("scroll", () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const scrollPct = (scrollTop / docHeight) * 100;
      progressBar.style.width = scrollPct + "%";
    });
  }

  /* ---------- 3. STICKY NAVBAR ---------- */
  const navbar = document.querySelector(".navbar");
  if (navbar) {
    let lastScrollY = window.scrollY;
    let ticking = false;

    window.addEventListener("scroll", () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;

          // Add/remove scrolled class based on scroll position
          navbar.classList.toggle("scrolled", currentScrollY > 50);

          // Hide navbar when scrolling down, show when scrolling up
          if (currentScrollY > lastScrollY && currentScrollY > 100) {
            navbar.classList.add("hidden");
          } else {
            navbar.classList.remove("hidden");
          }

          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  /* ---------- 4. HAMBURGER MENU ---------- */
  const hamburger = document.querySelector(".hamburger");
  const navLinks = document.querySelector(".nav-links");

  if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("open");
      hamburger.classList.toggle("active", isOpen);
      hamburger.setAttribute("aria-expanded", isOpen);
      document.body.style.overflow = isOpen ? "hidden" : "";
    });

    // Close menu on link click
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        hamburger.classList.remove("active");
        hamburger.setAttribute("aria-expanded", false);
        document.body.style.overflow = "";
      });
    });

    // Close menu on outside click
    document.addEventListener("click", (e) => {
      if (!navbar.contains(e.target) && navLinks.classList.contains("open")) {
        navLinks.classList.remove("open");
        hamburger.classList.remove("active");
        document.body.style.overflow = "";
      }
    });
  }

  /* ---------- 5. DROPDOWN HOVER (desktop) ---------- */
  if (window.innerWidth > 991) {
    document.querySelectorAll(".has-dropdown").forEach((item) => {
      const dropdown = item.querySelector(".dropdown-menu");
      let timeout;

      item.addEventListener("mouseenter", () => {
        clearTimeout(timeout);
        dropdown.style.opacity = "1";
        dropdown.style.visibility = "visible";
        dropdown.style.transform = "translateY(0)";
      });

      item.addEventListener("mouseleave", () => {
        timeout = setTimeout(() => {
          dropdown.style.opacity = "0";
          dropdown.style.visibility = "hidden";
          dropdown.style.transform = "translateY(10px)";
        }, 150);
      });
    });
  }

  /* ---------- 6. BACK TO TOP ---------- */
  const backToTop = document.querySelector(".back-to-top");
  if (backToTop) {
    window.addEventListener("scroll", () => {
      backToTop.classList.toggle("visible", window.scrollY > 400);
    });
    backToTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- 7. STATS COUNTER ---------- */
  const counters = document.querySelectorAll(".counter");
  if (counters.length) {
    const countUp = (el) => {
      const target = +el.getAttribute("data-target");
      const duration = 2000;
      const step = target / (duration / 16);
      let current = 0;

      const update = () => {
        current += step;
        if (current < target) {
          el.textContent = Math.floor(current).toLocaleString();
          requestAnimationFrame(update);
        } else {
          el.textContent = target.toLocaleString();
        }
      };
      update();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (
            entry.isIntersecting &&
            !entry.target.classList.contains("counted")
          ) {
            entry.target.classList.add("counted");
            countUp(entry.target);
          }
        });
      },
      { threshold: 0.5 },
    );

    counters.forEach((c) => observer.observe(c));
  }

  /* ---------- 8. HERO SLIDER ---------- */
  const slides = document.querySelectorAll(".hero-slide");
  const dots = document.querySelectorAll(".hero-dot");
  const prevBtn = document.querySelector(".hero-prev");
  const nextBtn = document.querySelector(".hero-next");
  let current = 0;
  let autoSlide;

  const goToSlide = (index) => {
    slides[current].classList.remove("active");
    dots[current]?.classList.remove("active");
    current = (index + slides.length) % slides.length;
    slides[current].classList.add("active");
    dots[current]?.classList.add("active");
  };

  const startAuto = () => {
    autoSlide = setInterval(() => goToSlide(current + 1), 5000);
  };

  const resetAuto = () => {
    clearInterval(autoSlide);
    startAuto();
  };

  if (slides.length) {
    slides[0].classList.add("active");
    dots[0]?.classList.add("active");
    startAuto();

    prevBtn?.addEventListener("click", () => {
      goToSlide(current - 1);
      resetAuto();
    });
    nextBtn?.addEventListener("click", () => {
      goToSlide(current + 1);
      resetAuto();
    });
    dots.forEach((dot, i) =>
      dot.addEventListener("click", () => {
        goToSlide(i);
        resetAuto();
      }),
    );
  }

  /* ---------- 9. COOKIE BANNER ---------- */
  const cookieBanner = document.querySelector(".cookie-banner");
  if (cookieBanner && !localStorage.getItem("cookieAccepted")) {
    setTimeout(() => cookieBanner.classList.add("visible"), 1500);

    document.querySelector(".cookie-accept")?.addEventListener("click", () => {
      localStorage.setItem("cookieAccepted", "true");
      cookieBanner.classList.remove("visible");
    });

    document.querySelector(".cookie-decline")?.addEventListener("click", () => {
      cookieBanner.classList.remove("visible");
    });
  }

  /* ---------- 10. AOS INIT ---------- */
  if (typeof AOS !== "undefined") {
    AOS.init({
      duration: 700,
      easing: "ease-out-cubic",
      once: true,
      offset: 60,
    });
  }

  /* ---------- 11. ACTIVE NAV LINK ---------- */
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === currentPage || (currentPage === "" && href === "index.html")) {
      link.classList.add("active");
    }
  });
});
