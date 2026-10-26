/**
 * Datos de demostracion de MedFollow AI.
 *
 * El seed no inserta alertas ni puntajes de riesgo a mano: crea pacientes y
 * planes reales y luego hace pasar mensajes de WhatsApp simulados por el
 * orquestador, de modo que las conversaciones, las senales clinicas, los
 * puntajes de riesgo y las alertas los produce el mismo pipeline de produccion.
 */
import { NestFactory } from '@nestjs/core';
import { AlertStatus, Channel, PrismaClient, RiskLevel, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PatientsService } from '../src/patients/patients.service';
import { FollowUpsService } from '../src/followups/followups.service';
import { ConversationOrchestrator } from '../src/orchestrator/conversation-orchestrator.service';
import { AlertsService } from '../src/alerts/alerts.service';
import { RequestUser } from '../src/common/decorators/current-user.decorator';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'MedFollow.2026';

interface DemoCase {
  fullName: string;
  phone: string;
  documentId: string;
  birthDate: string;
  sex: 'F' | 'M';
  pregnant?: boolean;
  comorbidities?: string[];
  diagnosisText: string;
  diagnosisCode?: string;
  instructions: string;
  medications: Array<{ name: string; dose: string; frequencyHours: number; durationDays: number }>;
  /** Mensajes que el paciente envia, en orden. */
  messages: string[];
  daysAgo: number;
}

const DEMO_CASES: DemoCase[] = [
  {
    fullName: 'Juan Perez Gomez',
    phone: '+573001112233',
    documentId: '1020304050',
    birthDate: '1979-03-14',
    sex: 'M',
    diagnosisText: 'Faringitis viral',
    diagnosisCode: 'J02.9',
    instructions: 'Reposo, abundante liquido, control si no mejora en 5 dias',
    medications: [{ name: 'Acetaminofen', dose: '500 mg', frequencyHours: 8, durationDays: 5 }],
    messages: ['ACEPTO', 'Me siento peor, tengo 39.5 grados y me cuesta respirar'],
    daysAgo: 2,
  },
  {
    fullName: 'Maria Gomez Ruiz',
    phone: '+573002223344',
    documentId: '1030405060',
    birthDate: '1962-08-02',
    sex: 'F',
    comorbidities: ['HTA', 'DIABETES'],
    diagnosisText: 'Sindrome febril sin foco',
    diagnosisCode: 'R50.9',
    instructions: 'Hidratacion abundante, control de temperatura cada 8 horas',
    medications: [{ name: 'Acetaminofen', dose: '500 mg', frequencyHours: 6, durationDays: 4 }],
    messages: ['ACEPTO', 'Tengo dolor en el pecho desde esta manana y me siento muy debil'],
    daysAgo: 1,
  },
  {
    fullName: 'Carlos Andres Mejia',
    phone: '+573003334455',
    documentId: '1040506070',
    birthDate: '1994-11-23',
    sex: 'M',
    diagnosisText: 'Gastroenteritis aguda',
    diagnosisCode: 'A09',
    instructions: 'Suero oral en sorbos frecuentes, dieta blanda',
    medications: [{ name: 'Sales de rehidratacion oral', dose: '1 sobre', frequencyHours: 8, durationDays: 3 }],
    messages: ['ACEPTO', 'Sigo con vomito y no he podido tomar liquidos, no he orinado hoy'],
    daysAgo: 1,
  },
  {
    fullName: 'Luz Marina Castro',
    phone: '+573004445566',
    documentId: '1050607080',
    birthDate: '1988-01-30',
    sex: 'F',
    pregnant: true,
    diagnosisText: 'Infeccion de vias urinarias',
    diagnosisCode: 'N39.0',
    instructions: 'Completar el antibiotico, aumentar ingesta de agua',
    medications: [{ name: 'Nitrofurantoina', dose: '100 mg', frequencyHours: 12, durationDays: 7 }],
    messages: ['ACEPTO', 'Todavia me arde al orinar pero estoy tomando el antibiotico'],
    daysAgo: 3,
  },
  {
    fullName: 'Pedro Antonio Silva',
    phone: '+573005556677',
    documentId: '1060708090',
    birthDate: '1951-06-11',
    sex: 'M',
    comorbidities: ['COPD'],
    diagnosisText: 'Infeccion respiratoria alta',
    diagnosisCode: 'J06.9',
    instructions: 'Reposo relativo, inhalador segun indicacion previa',
    medications: [{ name: 'Acetaminofen', dose: '500 mg', frequencyHours: 8, durationDays: 5 }],
    messages: ['ACEPTO', 'Tengo fiebre de 38.3 y sigo igual que ayer'],
    daysAgo: 2,
  },
  {
    fullName: 'Diana Carolina Ortiz',
    phone: '+573006667788',
    documentId: '1070809010',
    birthDate: '1997-09-19',
    sex: 'F',
    diagnosisText: 'Faringitis viral',
    diagnosisCode: 'J02.9',
    instructions: 'Gargaras con agua tibia y sal, reposo de voz',
    medications: [{ name: 'Ibuprofeno', dose: '400 mg', frequencyHours: 8, durationDays: 3 }],
    messages: ['ACEPTO', 'Estoy mucho mejor, ya casi no me duele la garganta y he tomado todas las dosis'],
    daysAgo: 3,
  },
  {
    fullName: 'Jose Luis Ramirez',
    phone: '+573007778899',
    documentId: '1080901020',
    birthDate: '1983-02-05',
    sex: 'M',
    diagnosisText: 'Gastroenteritis aguda',
    instructions: 'Dieta blanda, suero oral',
    medications: [{ name: 'Sales de rehidratacion oral', dose: '1 sobre', frequencyHours: 8, durationDays: 3 }],
    messages: ['ACEPTO', 'Olvide dos dosis del medicamento y sigo con algo de diarrea'],
    daysAgo: 2,
  },
  {
    fullName: 'Sandra Milena Vargas',
    phone: '+573008889900',
    documentId: '1090102030',
    birthDate: '1975-12-27',
    sex: 'F',
    diagnosisText: 'Sindrome febril sin foco',
    instructions: 'Control de temperatura, hidratacion',
    medications: [{ name: 'Acetaminofen', dose: '500 mg', frequencyHours: 6, durationDays: 4 }],
    messages: ['ACEPTO', 'Me salieron unas manchas rojas en la piel y sigo con fiebre'],
    daysAgo: 3,
  },
  {
    fullName: 'Andres Felipe Lozano',
    phone: '+573009990011',
    documentId: '1100203040',
    birthDate: '2001-04-16',
    sex: 'M',
    diagnosisText: 'Infeccion respiratoria alta',
    instructions: 'Reposo, liquidos abundantes',
    medications: [{ name: 'Acetaminofen', dose: '500 mg', frequencyHours: 8, durationDays: 5 }],
    messages: ['ACEPTO', 'Estoy bien, sin molestias'],
    daysAgo: 4,
  },
  {
    fullName: 'Gloria Esperanza Nino',
    phone: '+573010001122',
    documentId: '1110304050',
    birthDate: '1948-10-08',
    sex: 'F',
    comorbidities: ['HEART_FAILURE', 'CKD'],
    diagnosisText: 'Infeccion de vias urinarias',
    instructions: 'Completar antibiotico, control en 3 dias',
    medications: [{ name: 'Cefuroxima', dose: '500 mg', frequencyHours: 12, durationDays: 7 }],
    messages: ['ACEPTO', 'Me duele mucho la cintura del lado derecho y tengo fiebre'],
    daysAgo: 2,
  },
  {
    fullName: 'Oscar Ivan Beltran',
    phone: '+573011112233',
    documentId: '1120405060',
    birthDate: '1990-07-21',
    sex: 'M',
    diagnosisText: 'Faringitis viral',
    instructions: 'Reposo, liquidos',
    medications: [{ name: 'Acetaminofen', dose: '500 mg', frequencyHours: 8, durationDays: 5 }],
    messages: ['ACEPTO', 'Quiero hablar con una persona del hospital por favor'],
    daysAgo: 1,
  },
  {
    fullName: 'Claudia Patricia Mora',
    phone: '+573012223344',
    documentId: '1130506070',
    birthDate: '1969-05-03',
    sex: 'F',
    comorbidities: ['DIABETES'],
    diagnosisText: 'Gastroenteritis aguda',
    instructions: 'Suero oral, vigilar glucometrias',
    medications: [{ name: 'Sales de rehidratacion oral', dose: '1 sobre', frequencyHours: 8, durationDays: 3 }],
    messages: ['ACEPTO', 'La glucometria me dio 260 y sigo con diarrea desde hace 3 dias'],
    daysAgo: 3,
  },
];

const BULK_NAMES = [
  'Laura Jimenez', 'Hector Rincon', 'Natalia Pardo', 'Mauricio Salazar', 'Paula Cardenas',
  'Julian Ospina', 'Ximena Correa', 'Fabian Duarte', 'Marcela Trujillo', 'Alvaro Pena',
  'Camila Suarez', 'Ricardo Bernal', 'Angela Franco', 'Sebastian Cruz', 'Yolanda Prieto',
  'Nelson Acosta', 'Beatriz Leon', 'Hernan Zapata', 'Lorena Gil', 'Esteban Pulido',
  'Monica Avila', 'Rodrigo Valencia', 'Adriana Melo', 'Ivan Dario Soto', 'Carmen Rosa Diaz',
  'Felipe Arango', 'Daniela Quintero', 'Gustavo Navarro', 'Veronica Rueda', 'Mario Gaitan',
];

async function reset(): Promise<void> {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.riskScore.deleteMany(),
    prisma.adherenceEvent.deleteMany(),
    prisma.vitalReading.deleteMany(),
    prisma.symptomObservation.deleteMany(),
    prisma.message.deleteMany(),
    prisma.followUpCheckIn.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.medication.deleteMany(),
    prisma.followUpPlan.deleteMany(),
    prisma.consent.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.protocol.deleteMany(),
    prisma.user.deleteMany(),
    prisma.hospital.deleteMany(),
  ]);
}

async function main(): Promise<void> {
  console.log('Limpiando datos previos...');
  await reset();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const patientsService = app.get(PatientsService);
  const followUpsService = app.get(FollowUpsService);
  const orchestrator = app.get(ConversationOrchestrator);
  const alertsService = app.get(AlertsService);

  const hospital = await prisma.hospital.create({
    data: {
      name: 'Hospital Universitario San Rafael',
      legalId: '890900123-4',
      city: 'Bogota',
      timezone: 'America/Bogota',
      escalationPhone: '+573150000000',
      settings: { program: 'Seguimiento medicina general', bedCount: 420 },
    },
  });

  const passwordHash = await AuthService.hashPassword(DEMO_PASSWORD);
  const [admin, doctor, nurse] = await Promise.all([
    prisma.user.create({
      data: { hospitalId: hospital.id, email: 'admin@hospital.gov.co', passwordHash, fullName: 'Direccion Medica', role: Role.ADMIN },
    }),
    prisma.user.create({
      data: {
        hospitalId: hospital.id,
        email: 'medico@hospital.gov.co',
        passwordHash,
        fullName: 'Dr. Camilo Restrepo',
        role: Role.DOCTOR,
        licenseNumber: 'RM-445512',
      },
    }),
    prisma.user.create({
      data: { hospitalId: hospital.id, email: 'enfermeria@hospital.gov.co', passwordHash, fullName: 'Enf. Ana Maria Rojas', role: Role.NURSE },
    }),
  ]);
  console.log(`Hospital y equipo creados (${admin.email}, ${doctor.email}, ${nurse.email})`);

  const doctorUser: RequestUser = {
    id: doctor.id,
    email: doctor.email,
    fullName: doctor.fullName,
    role: doctor.role,
    hospitalId: hospital.id,
  };
  const nurseUser: RequestUser = {
    id: nurse.id,
    email: nurse.email,
    fullName: nurse.fullName,
    role: nurse.role,
    hospitalId: hospital.id,
  };

  console.log('Creando pacientes, planes de seguimiento y conversaciones...');
  for (const demo of DEMO_CASES) {
    const patient = await patientsService.create(
      {
        fullName: demo.fullName,
        documentType: 'CC',
        documentId: demo.documentId,
        phone: demo.phone,
        birthDate: demo.birthDate,
        sex: demo.sex,
        pregnant: demo.pregnant,
        comorbidities: demo.comorbidities ?? [],
      },
      doctorUser,
    );

    const consultationAt = new Date(Date.now() - demo.daysAgo * 24 * 60 * 60 * 1000);
    await followUpsService.create(
      {
        patientId: patient.id,
        diagnosisText: demo.diagnosisText,
        diagnosisCode: demo.diagnosisCode,
        instructions: demo.instructions,
        medications: demo.medications,
        consultationAt: consultationAt.toISOString(),
      },
      doctorUser,
    );

    const entity = await patientsService.getEntity(patient.id, hospital.id);
    for (let i = 0; i < demo.messages.length; i += 1) {
      // Antes del ultimo mensaje se despacha el contacto programado del dia,
      // para que la respuesta del paciente cuente como seguimiento efectivo.
      if (i === demo.messages.length - 1) {
        const due = await prisma.followUpCheckIn.findFirst({
          where: { patientId: patient.id, status: 'PENDING', dayOffset: { lte: demo.daysAgo } },
          orderBy: { dayOffset: 'desc' },
        });
        if (due) await orchestrator.sendCheckIn(due.id);
      }
      await orchestrator.handleInbound({ patient: entity, text: demo.messages[i], channel: Channel.WEB_SIMULATOR });
    }
    const after = await patientsService.getEntity(patient.id, hospital.id);
    console.log(`  ${demo.fullName.padEnd(26)} ${after.currentRiskLevel.padEnd(6)} score ${after.currentRiskScore}`);
  }

  console.log('Creando poblacion adicional en seguimiento...');
  for (let i = 0; i < BULK_NAMES.length; i += 1) {
    const level = i % 11 === 0 ? RiskLevel.YELLOW : RiskLevel.GREEN;
    const created = await patientsService.create(
      {
        fullName: BULK_NAMES[i],
        documentId: `20${String(100000 + i)}`,
        phone: `+5731${String(20000000 + i)}`,
        birthDate: `19${60 + (i % 35)}-0${1 + (i % 9)}-1${i % 9}`,
        sex: i % 2 === 0 ? 'F' : 'M',
      },
      doctorUser,
    );
    await prisma.patient.update({
      where: { id: created.id },
      data: {
        currentRiskLevel: level,
        currentRiskScore: level === RiskLevel.YELLOW ? 20 : 0,
        lastContactAt: new Date(Date.now() - (i % 5) * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Una alerta ya gestionada, para que el indicador de tiempo de respuesta tenga datos.
  const firstAlert = await prisma.alert.findFirst({
    where: { hospitalId: hospital.id, level: RiskLevel.RED },
    orderBy: { createdAt: 'asc' },
  });
  if (firstAlert) {
    await alertsService.acknowledge(firstAlert.id, nurseUser);
    await alertsService.resolve(
      firstAlert.id,
      'Paciente contactado por enfermeria, se indico acudir a urgencias y se confirmo su ingreso.',
      nurseUser,
    );
  }

  const [patients, alerts, messages, riskScores, openAlerts] = await Promise.all([
    prisma.patient.count(),
    prisma.alert.count(),
    prisma.message.count(),
    prisma.riskScore.count(),
    prisma.alert.count({ where: { status: AlertStatus.OPEN } }),
  ]);

  console.log('\nDatos de demostracion listos:');
  console.log(`  Pacientes: ${patients}`);
  console.log(`  Mensajes de conversacion: ${messages}`);
  console.log(`  Evaluaciones de riesgo: ${riskScores}`);
  console.log(`  Alertas: ${alerts} (abiertas: ${openAlerts})`);
  console.log(`\n  Usuarios de prueba (clave ${DEMO_PASSWORD}):`);
  console.log('    admin@hospital.gov.co       ADMIN');
  console.log('    medico@hospital.gov.co      DOCTOR');
  console.log('    enfermeria@hospital.gov.co  NURSE');

  await app.close();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
