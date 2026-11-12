import { formatNumber, WEIGHT_LIMITS, weightTrend } from '@diade/domain';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { useHealth } from '../context/HealthContext';
import { Icon, useColor } from '../design';
import { decimalFor } from './RecipeForm';
import { Button, Card, SectionLabel, TextField } from './ui';

const CHART_HEIGHT = 96;
const CHART_PAD = 8;

/** The weigh-ins' 7-day trend over the last 8 weeks, as a line with the newest point marked. */
const WeightChart: React.FC<{ points: Array<{ at: Date; kg: number }>; label: string }> = ({
  points,
  label,
}) => {
  const [width, setWidth] = useState(0);
  const line = useColor('action');
  const grid = useColor('border');
  if (points.length < 2) return null;
  const kgs = points.map((p) => p.kg);
  // At least 2 kg tall, so a flat month does not look like a cliff.
  const mid = (Math.max(...kgs) + Math.min(...kgs)) / 2;
  const span = Math.max(2, Math.max(...kgs) - Math.min(...kgs));
  const first = points[0].at.getTime();
  const last = points[points.length - 1].at.getTime();
  const x = (at: Date) =>
    CHART_PAD + ((at.getTime() - first) / Math.max(1, last - first)) * (width - 2 * CHART_PAD);
  const y = (kg: number) =>
    CHART_PAD + (1 - (kg - (mid - span / 2)) / span) * (CHART_HEIGHT - 2 * CHART_PAD);
  const end = points[points.length - 1];
  return (
    <View
      className="mt-3"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={label}
    >
      {width > 0 ? (
        <Svg width={width} height={CHART_HEIGHT}>
          <Line
            x1={0}
            x2={width}
            y1={y(mid)}
            y2={y(mid)}
            stroke={grid}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <Polyline
            points={points.map((p) => `${x(p.at)},${y(p.kg)}`).join(' ')}
            fill="none"
            stroke={line}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Circle cx={x(end.at)} cy={y(end.kg)} r={4} fill={line} />
        </Svg>
      ) : (
        <View style={{ height: CHART_HEIGHT }} />
      )}
    </View>
  );
};

/** Typing a weigh-in: a number in kg (a comma works), written to Health Connect. */
const WeighIn: React.FC = () => {
  const { t } = useTranslation();
  const { addWeight } = useHealth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const kg = Number(text.trim().replace(',', '.'));
  const valid =
    /^\d{2,3}([.,]\d)?$/.test(text.trim()) && kg >= WEIGHT_LIMITS.min && kg <= WEIGHT_LIMITS.max;
  const save = async () => {
    setBusy(true);
    try {
      await addWeight(kg);
      setText('');
    } catch (err) {
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="flex-row items-center gap-3 mt-4">
      <View className="flex-1">
        <TextField
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          placeholder={t('health.weighInPlaceholder')}
          accessibilityLabel={t('health.weighIn')}
        />
      </View>
      <Button label={t('health.weighIn')} onPress={save} disabled={!valid || busy} />
    </View>
  );
};

/**
 * Profile → Watch and scale: whether Díade reads Health Connect, today's steps, and the weight trend. Everything is
 * read on the phone; only the blocks a session marks done reach the server.
 */
export const HealthScreen: React.FC<{ visible: boolean; onClose: () => void }> = ({
  visible,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const decimal = decimalFor(i18n.language);
  const track = useColor('border-strong');
  const on = useColor('action');
  const { status, granted, stepsToday, weights, connect, disconnect, openSettings } = useHealth();
  const [busy, setBusy] = useState(false);

  const toggle = async (value: boolean) => {
    setBusy(true);
    try {
      if (!value) await disconnect();
      else if (!(await connect())) Alert.alert(t('health.notAllowedTitle'), t('health.notAllowed'));
    } catch (err) {
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setBusy(false);
    }
  };

  const trend = weightTrend(weights, new Date());
  const kg = (value: number) => t('health.kg', { value: formatNumber(value, decimal) });
  const change =
    trend.change === null
      ? null
      : trend.change === 0
        ? t('health.noChange')
        : t('health.change', {
            value: `${trend.change > 0 ? '+' : '−'}${formatNumber(Math.abs(trend.change), decimal)}`,
          });
  const note =
    status === 'missing'
      ? t('health.missing')
      : status === 'update'
        ? t('health.update')
        : status === 'on'
          ? t('health.onHint')
          : t('health.offHint');
  const missingSome =
    status === 'on' &&
    granted !== null &&
    (!granted.sessions || !granted.steps || !granted.weight || !granted.writeWeight);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-4 pt-2 pb-3">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('health.close')}
            hitSlop={8}
            className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center mr-3"
          >
            <Icon name="x" />
          </Pressable>
          <Text className="flex-1 text-title-2 font-bold text-ink">{t('health.title')}</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Card>
            <View className="flex-row items-center">
              <View className="flex-1 mr-3">
                <Text className="text-base font-semibold text-ink">{t('health.connect')}</Text>
                <Text className="text-sm leading-5 text-ink-muted mt-0.5">{note}</Text>
              </View>
              <Switch
                value={status === 'on'}
                onValueChange={toggle}
                disabled={busy || (status !== 'on' && status !== 'off')}
                accessibilityLabel={t('health.connect')}
                trackColor={{ false: track, true: on }}
              />
            </View>
            {missingSome ? (
              <Text className="text-sm leading-5 text-ink-muted mt-3">
                {t('health.missingSome')}
              </Text>
            ) : null}
            {status === 'on' || status === 'update' ? (
              <View className="mt-3">
                <Button label={t('health.openSettings')} variant="outline" onPress={openSettings} />
              </View>
            ) : null}
          </Card>

          {status === 'on' ? (
            <>
              <SectionLabel>{t('health.today')}</SectionLabel>
              <Card>
                <View className="flex-row items-baseline">
                  <Text className="flex-1 text-base text-ink">{t('health.steps')}</Text>
                  <Text className="text-lg font-semibold text-ink">
                    {stepsToday === null ? '—' : stepsToday.toLocaleString(i18n.language)}
                  </Text>
                </View>
              </Card>

              <SectionLabel>{t('health.weight')}</SectionLabel>
              <Card>
                {trend.current === null ? (
                  <Text className="text-sm leading-5 text-ink-muted">{t('health.noWeight')}</Text>
                ) : (
                  <View className="flex-row items-baseline">
                    <Text className="flex-1 text-sm text-ink-muted">{t('health.trend')}</Text>
                    <Text className="text-lg font-semibold text-ink">{kg(trend.current)}</Text>
                  </View>
                )}
                {change ? (
                  <Text className="text-sm text-ink-muted text-right mt-0.5">{change}</Text>
                ) : null}
                <WeightChart points={trend.points} label={t('health.chart')} />
                <WeighIn />
                <Text className="text-xs leading-4 text-ink-muted mt-3">
                  {t('health.weightHint')}
                </Text>
              </Card>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

/** Today: the steps so far, under the week's training, when Health Connect is on. */
export const TodaySteps: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { status, stepsToday } = useHealth();
  if (status !== 'on' || stepsToday === null) return null;
  return (
    <Text className="text-sm text-ink-muted mt-3">
      {t('health.stepsToday', {
        count: stepsToday,
        steps: stepsToday.toLocaleString(i18n.language),
      })}
    </Text>
  );
};
