const tabs = document.querySelectorAll(".tab");
const headline = document.querySelector("#headline");
const intro = document.querySelector("#intro");
const statValue = document.querySelector("#stat-value");
const statFoot = document.querySelector("#stat-foot");
const drawer = document.querySelector("#brand-drawer");
const drawerToggle = document.querySelector("#drawer-toggle");

const tabContent = {
  brackets: { headline: "Make noise.<br><em>Leave a mark.</em>", intro: "XBT Esports is an independent esports platform for sharp players, brave ideas, and the communities that move culture forward.", stat: "08", foot: "OPEN BRACKET SIGNALS" },
  funding: { headline: "Back the<br><em>next signal.</em>", intro: "Invest in the players, organizers, and culture-builders shaping the next chapter of competitive gaming.", stat: "$250K", foot: "COMMUNITY CAPITAL TARGET" }
};

tabs.forEach((tab) => tab.addEventListener("click", () => {
  const content = tabContent[tab.dataset.tab];
  tabs.forEach((item) => item.classList.toggle("active", item === tab));
  headline.innerHTML = content.headline;
  intro.textContent = content.intro;
  statValue.textContent = content.stat;
  statFoot.textContent = content.foot;
}));

function toggleDrawer() {
  const open = drawer.classList.toggle("open");
  drawerToggle.setAttribute("aria-expanded", open);
  drawer.setAttribute("aria-hidden", !open);
  drawerToggle.firstChild.textContent = open ? "CLOSE " : "ABOUT XBT ";
}

drawerToggle.addEventListener("click", toggleDrawer);
document.querySelector("#open-drawer").addEventListener("click", toggleDrawer);
