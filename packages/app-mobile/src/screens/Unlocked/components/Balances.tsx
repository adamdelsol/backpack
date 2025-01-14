// TODO(peter) one thing we might need to make sure is that when we wrap these FlatLists in a ScrollView, we can't nest virtualized lists.
// This means we might just use the scrollview directly from within a flatlist by using ListHeaderComponent and ListFooterComponent
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ListRowSeparator,
  Margin,
  ProxyImage,
  StyledTextInput,
} from "@components";
import type { Blockchain } from "@coral-xyz/common";
import { formatUSD, walletAddressDisplay } from "@coral-xyz/common";
import type { useBlockchainTokensSorted } from "@coral-xyz/recoil";
import {
  blockchainBalancesSorted,
  useActiveWallets,
  useBlockchainConnectionUrl,
  useEnabledBlockchains,
  useLoader,
} from "@coral-xyz/recoil";
import { useTheme } from "@hooks";
import * as Clipboard from "expo-clipboard";

import type { Token } from "./index";
import { TableHeader } from "./index";

export function SearchableTokenTables({
  onPressRow,
  customFilter = () => true,
}: {
  onPressRow: (blockchain: Blockchain, token: Token) => void;
  customFilter: (token: Token) => boolean;
}) {
  const [searchFilter, setSearchFilter] = useState("");
  return (
    <>
      <Margin bottom={12}>
        <StyledTextInput
          placeholder="Search"
          value={searchFilter}
          onChangeText={setSearchFilter}
        />
      </Margin>
      <TokenTables
        searchFilter={searchFilter}
        onPressRow={onPressRow}
        customFilter={customFilter}
      />
    </>
  );
}

// Renders each blockchain section
export function TokenTables({
  blockchains,
  onPressRow,
  searchFilter = "",
  customFilter = () => true,
}: {
  blockchains?: Array<Blockchain>;
  onPressRow: (blockchain: Blockchain, token: Token) => void;
  searchFilter?: string;
  customFilter?: (token: Token) => boolean;
}) {
  const enabledBlockchains = useEnabledBlockchains();
  const filteredBlockchains =
    blockchains?.filter((b) => enabledBlockchains.includes(b)) ||
    enabledBlockchains;

  return (
    <View>
      {filteredBlockchains.map((blockchain: Blockchain) => {
        return (
          <Margin key={blockchain} bottom={12}>
            <TokenTable
              blockchain={blockchain}
              onPressRow={onPressRow}
              searchFilter={searchFilter}
              customFilter={customFilter}
            />
          </Margin>
        );
      })}
    </View>
  );
}

// Renders the header (expand/collapse) as well as the list of tokens
function TokenTable({
  blockchain,
  onPressRow,
  tokenAccounts,
  searchFilter = "",
  customFilter = () => true,
  displayWalletHeader = true,
}: {
  blockchain: Blockchain;
  onPressRow: (blockchain: Blockchain, token: Token) => void;
  tokenAccounts?: ReturnType<typeof useBlockchainTokensSorted>;
  searchFilter?: string;
  customFilter?: (token: Token) => boolean;
  displayWalletHeader?: boolean;
}): JSX.Element {
  const theme = useTheme();
  const [search, setSearch] = useState(searchFilter);
  const [expanded, setExpanded] = React.useState(true);
  const onPressExpand = () => {
    setExpanded(!expanded);
  };

  const connectionUrl = useBlockchainConnectionUrl(blockchain);
  const activeWallets = useActiveWallets();
  const wallet = activeWallets.filter((w) => w.blockchain === blockchain)[0];

  const [rawTokenAccounts, _, isLoading] = tokenAccounts
    ? [tokenAccounts, "hasValue"]
    : useLoader(
        blockchainBalancesSorted({
          publicKey: wallet.publicKey.toString(),
          blockchain,
        }),
        [],
        [wallet.publicKey, connectionUrl]
      );

  const searchLower = search.toLowerCase();
  const tokenAccountsFiltered = rawTokenAccounts
    .filter(
      (t: any) =>
        t.name &&
        (t.name.toLowerCase().startsWith(searchLower) ||
          t.ticker.toLowerCase().startsWith(searchLower))
    )
    .filter(customFilter);

  useEffect(() => {
    setSearch(searchFilter);
  }, [searchFilter]);

  return (
    <View
      style={{
        borderColor: theme.custom.colors.borderFull,
        backgroundColor: theme.custom.colors.nav,
        borderRadius: 12,
      }}
    >
      <TableHeader
        blockchain={blockchain}
        onPress={onPressExpand}
        visible={expanded}
        subtitle={
          displayWalletHeader ? (
            <Margin left={6}>
              <CopyWalletAddressSubtitle publicKey={wallet.publicKey} />
            </Margin>
          ) : undefined
        }
      />

      {expanded ? (
        <FlatList
          scrollEnabled={false}
          data={tokenAccountsFiltered}
          keyExtractor={(item) => item.address}
          ItemSeparatorComponent={ListRowSeparator}
          renderItem={({ item: token }) => {
            return (
              <TokenRow
                onPressRow={onPressRow}
                blockchain={blockchain}
                token={token}
              />
            );
          }}
        />
      ) : null}
    </View>
  );
}

function CopyWalletAddressSubtitle({
  publicKey,
}: {
  publicKey: string;
}): JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={async () => {
        await Clipboard.setStringAsync(publicKey);
      }}
    >
      <Text style={{ color: theme.custom.colors.secondary }}>
        {walletAddressDisplay(publicKey)}
      </Text>
    </Pressable>
  );
}

// Used for each individual row  of Balances
function TextPercentChanged({ percentChange }: { percentChange: number }) {
  const theme = useTheme();
  const positive = percentChange && percentChange > 0 ? true : false;
  const negative = percentChange && percentChange < 0 ? true : false;
  const neutral = percentChange && percentChange === 0 ? true : false;

  return (
    <>
      {percentChange !== undefined && positive && (
        <Text
          style={[
            styles.tokenBalanceChangePositive,
            { color: theme.custom.colors.positive },
          ]}
        >
          +{formatUSD(percentChange.toLocaleString())}
        </Text>
      )}
      {percentChange !== undefined && negative && (
        <Text
          style={[
            styles.tokenBalanceChangeNegative,
            { color: theme.custom.colors.negative },
          ]}
        >
          {formatUSD(percentChange.toLocaleString())}
        </Text>
      )}
      {percentChange !== undefined && neutral && (
        <Text
          style={[
            styles.tokenBalanceChangeNeutral,
            { color: theme.custom.colors.secondary },
          ]}
        >
          {formatUSD(percentChange.toLocaleString())}
        </Text>
      )}
    </>
  );
}

// Used in BalanceDetail TokenHeader, slightly diff than the other one
function RecentPercentChange({
  recentPercentChange,
}: {
  recentPercentChange: number | undefined;
}): JSX.Element {
  const theme = useTheme();
  const color =
    recentPercentChange === undefined
      ? ""
      : recentPercentChange > 0
      ? theme.custom.colors.positive
      : theme.custom.colors.negative;

  return <Text style={{ color }}>{recentPercentChange}%</Text>;
}

// Used in BalanceDetail TokenHeader, slightly diff than other recent percent changes
export function UsdBalanceAndPercentChange({
  usdBalance,
  recentPercentChange,
}: {
  usdBalance: number;
  recentPercentChange: number | undefined;
}): JSX.Element {
  const theme = useTheme();
  return (
    <View style={usdBalanceAndPercentChangeStyles.container}>
      <Text
        style={[
          usdBalanceAndPercentChangeStyles.usdBalanceLabel,
          { color: theme.custom.colors.secondary },
        ]}
      >
        ${parseFloat(usdBalance.toFixed(2)).toLocaleString()}{" "}
        <RecentPercentChange recentPercentChange={recentPercentChange} />
      </Text>
    </View>
  );
}

// Renders the individual token row
export function TokenRow({
  onPressRow,
  token,
  blockchain,
}: {
  onPressRow: (blockchain: Blockchain, token: Token) => void;
  token: Token;
  blockchain: Blockchain;
}): JSX.Element {
  const theme = useTheme();
  const { name, recentUsdBalanceChange, logo: iconUrl } = token;

  let subtitle = token.ticker;
  if (token.displayBalance) {
    subtitle = `${token.displayBalance.toLocaleString()} ${subtitle}`;
  }

  let trim;
  try {
    trim = `${subtitle.split(".")[0]}.${subtitle.split(".")[1].slice(0, 5)}`;
  } catch {
    // pass
  }

  return (
    <Pressable
      onPress={() => onPressRow(blockchain, token)}
      style={styles.rowContainer}
    >
      <View style={{ flexDirection: "row" }}>
        {iconUrl ? (
          <Margin right={12}>
            <ProxyImage style={styles.rowLogo} src={iconUrl} />
          </Margin>
        ) : null}
        <View>
          <Text
            style={[styles.tokenName, { color: theme.custom.colors.fontColor }]}
          >
            {name}
          </Text>
          <Text
            style={[
              styles.tokenAmount,
              { color: theme.custom.colors.secondary },
            ]}
          >
            {trim ? trim : subtitle}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text
          style={[
            styles.tokenBalance,
            { color: theme.custom.colors.fontColor },
          ]}
        >
          {formatUSD(token.usdBalance)}
        </Text>
        <TextPercentChanged percentChange={recentUsdBalanceChange} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    overflow: "hidden",
  },
  rowLogo: {
    width: 50,
    height: 50,
    aspectRatio: 1,
    borderRadius: 25,
  },
  tokenName: {
    height: 24,
    fontWeight: "500",
    fontSize: 16,
    lineHeight: 24,
  },
  tokenAmount: {
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 20,
  },
  tokenBalance: {
    fontWeight: "500",
    fontSize: 16,
    lineHeight: 24,
  },
  tokenBalanceChangeNeutral: {
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 20,
  },
  tokenBalanceChangePositive: {
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 20,
  },
  tokenBalanceChangeNegative: {
    fontWeight: "500",
    fontSize: 12,
  },
});

const usdBalanceAndPercentChangeStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
  },
  usdBalanceLabel: {
    fontWeight: "500",
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 24,
  },
});
