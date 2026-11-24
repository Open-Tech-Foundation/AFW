import { Tab, TabList, TabPanel, Tabs } from "../../components/Tabs.jsx";

export function Basic(props) {
  return (
    <Tabs defaultValue="b" activation={props.activation} onValueChange={props.onChange}>
      <TabList aria-label="Project">
        <Tab value="a">Overview</Tab>
        <Tab value="b">Activity</Tab>
        <Tab value="c" disabled>Archived</Tab>
        <Tab value="d">Settings</Tab>
      </TabList>
      <TabPanel value="a">Overview panel</TabPanel>
      <TabPanel value="b">Activity panel</TabPanel>
      <TabPanel value="c">Archived panel</TabPanel>
      <TabPanel value="d">Settings panel</TabPanel>
    </Tabs>
  );
}
