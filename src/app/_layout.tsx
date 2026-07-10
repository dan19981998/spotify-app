import { Stack } from "expo-router";
import { Image, StatusBar, StyleSheet, View } from "react-native";

export default function Layout() {
  return (
    <View style={styles.root}>
      <StatusBar hidden barStyle="light-content" />
      <Stack screenOptions={{ headerShown: false }} />
      <View style={styles.mainBorderOverlay} pointerEvents="none">
        <Image
          source={require("../../assets/images/mainborder.png")}
          style={styles.mainBorder}
          resizeMode="stretch"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  mainBorderOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 999,
    elevation: 999,
  },
  mainBorder: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
});
