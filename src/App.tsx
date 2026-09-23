import { useLenis } from './hooks/useLenis'
import { Nav } from './components/Nav'
import { GridField } from './backdrop/GridField'
import { Placeholder } from './sections/Placeholder'
import { profile } from './content/profile'

export default function App() {
  useLenis()

  return (
    <>
      <GridField />
      <Nav />
      <main className="content">
        <Placeholder
          id="intro"
          number={profile.sections[0].number}
          title={profile.displayName}
          body={profile.statement}
        />
        <Placeholder
          id="work"
          number={profile.sections[1].number}
          title="Work"
          body="Projects, placeholder — Phase 3."
        />
        <Placeholder
          id="experiments"
          number={profile.sections[2].number}
          title="Experiments"
          body="Fields I'm exploring, placeholder — Phase 3."
        />
        <Placeholder
          id="about"
          number={profile.sections[3].number}
          title="About"
          body="Curiosity, the pilot dream, sports, friends — Phase 4."
        />
        <Placeholder
          id="contact"
          number={profile.sections[4].number}
          title="Contact"
          body="Placeholder — Phase 4."
        />
      </main>
    </>
  )
}
