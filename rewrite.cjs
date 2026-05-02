const fs = require('fs');
const content = fs.readFileSync('src/components/Home.tsx', 'utf8');

const projectsStart = content.indexOf('<section>\n              <div className="flex items-center justify-between mb-4">\n                <h3 className="text-lg md:text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">\n                  <Clock className="w-5 h-5 text-green-500" />\n                  {t(\'dashboard.recentProjects\')}');

const campaignsStart = content.indexOf('<section>\n              <div className="flex items-center justify-between mb-4">\n                <h3 className="text-lg md:text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">\n                  <Megaphone className="w-5 h-5 text-indigo-500" />\n                  {t(\'sidebar.campaigns\', \'Campaigns\')}');

const librariesStart = content.indexOf('<section>\n              <div className="flex items-center justify-between mb-4">\n                <h3 className="text-lg md:text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">\n                  <LayoutGrid className="w-5 h-5 text-blue-500" />\n                  {t(\'dashboard.libraries\')}');

if (projectsStart > -1 && campaignsStart > -1 && librariesStart > -1) {
  const beforeProjects = content.substring(0, projectsStart);
  const projectsSection = content.substring(projectsStart, campaignsStart);
  const campaignsSection = content.substring(campaignsStart, librariesStart);
  const librariesSectionEnd = content.indexOf('</section>', librariesStart) + 10;
  const librariesSection = content.substring(librariesStart, librariesSectionEnd) + '\n';
  const afterLibraries = content.substring(librariesSectionEnd + 1);

  // New order: projects, libraries, campaigns
  // But wait, what if there's trailing spaces or something? 
  // The libraries block in the file ends with </section>.
  // Campaigns block ends before <section> of libraries.
  
  // To be perfectly precise, we should just match the sections:
  const newContent = beforeProjects + projectsSection + librariesSection + '\n' + campaignsSection.trimEnd() + '\n            ' + afterLibraries.trimStart();
  fs.writeFileSync('src/components/Home.tsx', newContent);
  console.log("Rewrite successful");
} else {
  console.error("Could not find sections");
  console.log("projects", projectsStart);
  console.log("campaigns", campaignsStart);
  console.log("libraries", librariesStart);
}
